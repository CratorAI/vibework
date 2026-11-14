//! In-process shell command parser for the permission policy (`policy.rs`).
//!
//! Turns a shell command string into the list of simple commands it would
//! run (including the ones inside `$( )`, backticks, `<( )`, subshells,
//! `{ }` groups, `if`/`case` branches, `for`/`while`/`until` loops, unquoted
//! heredoc bodies and `eval` arguments), plus the list operators, pipes and
//! redirections around them.
//!
//! Each word also keeps its parts (literal text, `$NAME`, or a value only
//! known when it runs), and each command the variables it can see: a `for`
//! loop's word list inside its body, the lines a `while read` gets from a
//! `find` before it, and `NAME=value` assignments made unconditionally at the
//! top level. [`ParsedBashCommand::values`] turns a word into every literal
//! value it can take, so the policy judges `cat "$f"` by the files `$f` can
//! name. A variable bound any other way is never resolved.
//!
//! This is a security boundary, so the parser is deliberately strict: any
//! syntax it does not fully understand (arithmetic, `[[ ]]`, `${ }` containing
//! nested expansions, ANSI-C quoting, function definitions, unterminated
//! quotes, ...) produces a parse failure, and a parse failure makes the policy
//! fall back to asking the user. It never guesses.

use std::collections::HashSet;

/// Maximum nesting of substitutions / subshells / eval before giving up.
const MAX_DEPTH: usize = 16;

/// Words that bash treats as reserved at the start of a command. A command
/// starting with one of these is a compound command we do not parse.
const RESERVED_WORDS: &[&str] = &[
    "if", "then", "else", "elif", "fi", "case", "esac", "for", "select", "while", "until", "do",
    "done", "function", "time", "coproc", "{", "}", "!", "[[", "]]", "in",
];

/// Result of parsing a command string.
///
/// The policy reads `success`, `commands` and `pipes`. `operators`,
/// `redirections` (all of them, across commands) and `error` are read only
/// by this file's tests, which pin how lists and redirections are split.
#[derive(Debug, Clone, Default)]
pub struct ParsedBashCommand {
    pub success: bool,
    pub commands: Option<Vec<CommandInfo>>,
    #[cfg_attr(not(test), allow(dead_code))]
    pub operators: Option<Vec<OperatorInfo>>,
    pub pipes: Option<Vec<PipeInfo>>,
    #[cfg_attr(not(test), allow(dead_code))]
    pub redirections: Option<Vec<RedirectionInfo>>,
    #[cfg_attr(not(test), allow(dead_code))]
    pub error: Option<String>,
    /// Variables bound in the command (see [`ParsedBashCommand::values`]).
    pub bindings: Vec<Binding>,
    /// Names bound in a way the parser does not follow (inside a branch,
    /// by `read`, `export`, `unset`, ...): never resolved.
    pub tainted: HashSet<String>,
    /// Every name the command binds or changes in any way.
    pub bound_names: HashSet<String>,
    /// `source`/`.`/`eval` ran: any variable may have been changed.
    pub opaque: bool,
    /// Heredoc bodies, by [`RedirectionInfo::heredoc`].
    pub heredocs: Vec<Option<String>>,
}

/// One part of a word.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Part {
    /// Literal text (after quote removal).
    Lit(String),
    /// `$NAME` or `${NAME}`.
    Var(String),
    /// A command substitution (`$( )`, backticks, `<( )`) or `$?`, `$#`,
    /// `$$`, `$!`, `$-`: text the shell computes. The commands inside are
    /// listed (and judged) on their own.
    Computed,
    /// Positional parameters or a `${ }` with an operator: not followed.
    Opaque,
}

/// Why a word has no literal value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Unresolved {
    /// A variable the command does not set itself (the environment's).
    Var(String),
    /// Text computed while it runs (a substitution, a line read, a variable
    /// set in a way the parser does not follow).
    Computed,
}

/// A variable binding the parser follows.
#[derive(Debug, Clone)]
pub struct Binding {
    pub name: String,
    kind: BindingKind,
    /// Bindings visible where this one was made (for words that use them).
    scope: Vec<usize>,
}

#[derive(Debug, Clone)]
enum BindingKind {
    /// One of these words (a `for` list, or the one word of `NAME=value`).
    Words(Vec<Vec<Part>>),
    /// Lines from the commands piped into a `while read` (by index): paths
    /// when they are a `find` with a `-name` and line filters.
    Piped(Vec<usize>),
    /// Set while running (a `read` with other input, a loop variable after
    /// its loop).
    Computed,
}

/// Most literal values a word may expand to before it counts as computed.
const MAX_VALUES: usize = 64;

impl ParsedBashCommand {
    /// Every literal value `parts` can take where a command with `scope`
    /// runs. `env` gives values for variables the command does not bind
    /// (the app's own, such as the task's scratch folder); anything else
    /// unresolved is an error saying why.
    pub fn values(
        &self,
        scope: &[usize],
        parts: &[Part],
        env: &dyn Fn(&str) -> Option<Vec<String>>,
    ) -> Result<Vec<String>, Unresolved> {
        self.values_at(scope, parts, env, 0)
    }

    fn values_at(
        &self,
        scope: &[usize],
        parts: &[Part],
        env: &dyn Fn(&str) -> Option<Vec<String>>,
        depth: usize,
    ) -> Result<Vec<String>, Unresolved> {
        if depth > MAX_DEPTH {
            return Err(Unresolved::Computed);
        }
        let mut out = vec![String::new()];
        let mut computed = false;
        for part in parts {
            let options: Vec<String> = match part {
                Part::Lit(text) => vec![text.clone()],
                Part::Var(name) => match self.variable(scope, name, env, depth) {
                    Ok(v) => v,
                    Err(Unresolved::Var(name)) => return Err(Unresolved::Var(name)),
                    Err(Unresolved::Computed) => {
                        computed = true;
                        continue;
                    }
                },
                Part::Opaque => return Err(Unresolved::Var("$".into())),
                Part::Computed => {
                    computed = true;
                    continue;
                }
            };
            if out.len() * options.len().max(1) > MAX_VALUES {
                computed = true;
                continue;
            }
            out = out
                .iter()
                .flat_map(|prefix| options.iter().map(move |o| format!("{prefix}{o}")))
                .collect();
        }
        if computed {
            Err(Unresolved::Computed)
        } else {
            Ok(out)
        }
    }

    fn variable(
        &self,
        scope: &[usize],
        name: &str,
        env: &dyn Fn(&str) -> Option<Vec<String>>,
        depth: usize,
    ) -> Result<Vec<String>, Unresolved> {
        if self.opaque || self.tainted.contains(name) {
            return Err(Unresolved::Computed);
        }
        let Some(&id) = scope.iter().rev().find(|&&id| self.bindings[id].name == name) else {
            return env(name).ok_or_else(|| Unresolved::Var(name.to_string()));
        };
        let binding = &self.bindings[id];
        match &binding.kind {
            BindingKind::Computed => Err(Unresolved::Computed),
            BindingKind::Words(words) => {
                let mut all = Vec::new();
                for word in words {
                    all.extend(self.values_at(&binding.scope, word, env, depth + 1)?);
                    if all.len() > MAX_VALUES {
                        return Err(Unresolved::Computed);
                    }
                }
                Ok(all)
            }
            BindingKind::Piped(upstream) => self.found_paths(upstream, env, depth),
        }
    }

    /// The paths a `find <dirs> -name <pattern>` prints, when only line
    /// filters stand between it and the `while read`: `<dir>/<pattern>` for
    /// each. Anything else is computed text.
    fn found_paths(
        &self,
        upstream: &[usize],
        env: &dyn Fn(&str) -> Option<Vec<String>>,
        depth: usize,
    ) -> Result<Vec<String>, Unresolved> {
        let commands = self.commands.as_deref().unwrap_or_default();
        let Some((first, rest)) = upstream.split_first() else {
            return Err(Unresolved::Computed);
        };
        let find = &commands[*first];
        if !find.program_is_literal || find.program != "find" || !find.assignments.is_empty() {
            return Err(Unresolved::Computed);
        }
        for &i in rest {
            let c = &commands[i];
            let operands: Vec<&String> = c.args.iter().filter(|a| !a.starts_with('-')).collect();
            let filter = c.program_is_literal
                && c.assignments.is_empty()
                && c.redirections.iter().all(|r| !r.op.starts_with('<'))
                && match c.program.as_str() {
                    "sort" | "uniq" => operands.is_empty() && !c.args.iter().any(|a| a.starts_with("-o") || a == "--output"),
                    "head" | "tail" => operands.iter().all(|a| a.chars().all(|ch| ch.is_ascii_digit())),
                    "grep" => operands.len() == 1 && !c.args.iter().any(|a| a.starts_with("-r") || a.starts_with("-R") || a.starts_with("-f") || a == "-l" || a == "-L" || a == "--files-with-matches"),
                    _ => false,
                };
            if !filter {
                return Err(Unresolved::Computed);
            }
        }
        let args = &find.args;
        let mut i = 0;
        while i < args.len() && matches!(args[i].as_str(), "-H" | "-P") {
            i += 1;
        }
        let mut dirs = Vec::new();
        while i < args.len() && !args[i].starts_with('-') && args[i] != "(" && args[i] != "!" {
            dirs.extend(self.values_at(&find.scope, &find.arg_parts[i], env, depth + 1)?);
            i += 1;
        }
        if dirs.is_empty() {
            dirs.push(".".into());
        }
        // Only a plain conjunction of tests: every path printed matches every
        // -name. A `!`, `-o`, `( )` or any other test could print other names.
        let mut patterns: Option<Vec<String>> = None;
        while i < args.len() {
            match args[i].as_str() {
                "-name" | "-iname" => {
                    let Some(parts) = find.arg_parts.get(i + 1) else { return Err(Unresolved::Computed) };
                    let these = self.values_at(&find.scope, parts, env, depth + 1)?;
                    // Every -name must match, so the first one bounds the output.
                    patterns.get_or_insert(these);
                    i += 1;
                }
                "-type" | "-maxdepth" | "-mindepth" | "-size" | "-mtime" | "-mmin" | "-atime" | "-ctime" => i += 1,
                "-print" | "-print0" | "-empty" | "-a" | "-and" => {}
                _ => return Err(Unresolved::Computed),
            }
            i += 1;
        }
        let patterns = patterns.unwrap_or_default();
        if patterns.is_empty() || patterns.iter().any(|p| p.contains('/')) {
            return Err(Unresolved::Computed);
        }
        Ok(dirs
            .iter()
            .flat_map(|d| patterns.iter().map(move |p| format!("{}/{}", d.trim_end_matches('/'), p)))
            .collect())
    }

    /// The body of a heredoc redirection.
    pub fn heredoc_body(&self, redirection: &RedirectionInfo) -> Option<&str> {
        redirection.heredoc.and_then(|i| self.heredocs.get(i)).and_then(|b| b.as_deref())
    }
}

/// One simple command that would be executed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandInfo {
    /// Program word after quote removal (e.g. `"rm"` and `r\m` both give `rm`).
    pub program: String,
    /// Remaining words after quote removal. Expansions such as `$HOME` or
    /// `$(...)` are kept as their source text.
    pub args: Vec<String>,
    /// Program, args and redirections joined with single spaces (quote-removed).
    pub full: String,
    /// `NAME=value` prefixes (source text).
    pub assignments: Vec<String>,
    /// Redirections attached to this command.
    pub redirections: Vec<RedirectionInfo>,
    /// False when the program word contains a parameter expansion or command
    /// substitution, i.e. the program actually run cannot be known statically.
    pub program_is_literal: bool,
    /// The parts of each of `args`.
    pub arg_parts: Vec<Vec<Part>>,
    /// Each assignment's name (with a trailing `+` for `+=`) and value parts.
    pub assignment_values: Vec<(String, Vec<Part>)>,
    /// The bindings this command sees (indexes into `bindings`).
    pub scope: Vec<usize>,
    /// Its input comes from a pipe (it, or the compound command holding it,
    /// is not the first in a pipeline).
    pub stdin_piped: bool,
}

/// A list operator between pipelines: `&&`, `||`, `;`, `&` or a newline (`\n`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperatorInfo {
    pub op: String,
}

/// A pipe between commands: `|` or `|&`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PipeInfo {
    pub op: String,
}

/// A redirection such as `2>&1`, `> out.txt`, `< in.txt` or `<<EOF`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedirectionInfo {
    /// File descriptor prefix, if written (e.g. `2` in `2>file`).
    pub fd: Option<String>,
    /// The operator: `<`, `>`, `>>`, `>|`, `<>`, `<&`, `>&`, `&>`, `&>>`, `<<`, `<<-`, `<<<`.
    pub op: String,
    /// The target word after quote removal (heredoc delimiter for `<<`).
    pub target: String,
    /// The parts of the target word.
    pub parts: Vec<Part>,
    /// For `<<`/`<<-`: the body's index (see [`ParsedBashCommand::heredoc_body`]).
    pub heredoc: Option<usize>,
}

impl RedirectionInfo {
    /// Whether this redirection can create or modify a file.
    ///
    /// Input redirections, heredocs, fd duplication/closing (`2>&1`, `>&-`)
    /// and output to `/dev/null` are not writes.
    pub fn writes_file(&self) -> bool {
        let is_fd_target = !self.target.is_empty()
            && (self.target == "-" || self.target.chars().all(|c| c.is_ascii_digit()));
        match self.op.as_str() {
            "<" | "<<" | "<<-" | "<<<" => false,
            "<&" => !is_fd_target,
            ">&" => !is_fd_target && self.target != "/dev/null",
            ">" | ">>" | ">|" | "&>" | "&>>" | "<>" => self.target != "/dev/null",
            _ => true,
        }
    }

    fn display(&self) -> String {
        format!("{}{} {}", self.fd.as_deref().unwrap_or(""), self.op, self.target)
    }
}

/// Parse a command string. Never panics; anything not understood yields
/// `success: false` with an error message.
pub fn parse_bash_command(command: &str) -> ParsedBashCommand {
    let mut out = Output::default();
    let result = parse_script(command, 0, Vec::new(), &mut out).and_then(|()| {
        if out.commands.is_empty() {
            Err("no command found".to_string())
        } else {
            Ok(())
        }
    });
    match result {
        Ok(()) => ParsedBashCommand {
            success: true,
            commands: Some(out.commands),
            operators: Some(out.operators),
            pipes: Some(out.pipes),
            redirections: Some(out.redirections),
            error: None,
            bindings: out.bindings,
            tainted: out.tainted,
            bound_names: out.bound,
            opaque: out.opaque,
            heredocs: out.heredocs,
        },
        Err(e) => ParsedBashCommand {
            success: false,
            error: Some(e),
            ..Default::default()
        },
    }
}

// ============================================================================
// Internals
// ============================================================================

type PResult<T> = Result<T, String>;

#[derive(Debug, Default)]
struct Output {
    commands: Vec<CommandInfo>,
    operators: Vec<OperatorInfo>,
    pipes: Vec<PipeInfo>,
    redirections: Vec<RedirectionInfo>,
    bindings: Vec<Binding>,
    tainted: HashSet<String>,
    bound: HashSet<String>,
    opaque: bool,
    heredocs: Vec<Option<String>>,
}

impl Output {
    /// A name bound in a way the parser does not follow.
    fn taint(&mut self, name: &str) {
        self.bound.insert(name.to_string());
        self.tainted.insert(name.to_string());
    }
}

#[derive(Debug)]
struct PendingHeredoc {
    delimiter: String,
    strip_tabs: bool,
    quoted: bool,
    id: usize,
}

/// Where a list of commands stops: end of input, a `)`, or a reserved word
/// (`then`, `done`, ...), or `;;` inside a `case`.
#[derive(Clone, Copy)]
struct Term<'a> {
    close: Option<char>,
    words: &'a [&'a str],
    case_item: bool,
}

const TOP: Term<'static> = Term { close: None, words: &[], case_item: false };

#[derive(Debug, Default)]
struct Word {
    /// Source text of the word.
    raw: String,
    /// Text after quote removal (expansions kept as source text).
    value: String,
    /// Contains a parameter expansion or command substitution (unquoted or in double quotes).
    has_expansion: bool,
    /// Any quoting or escaping was used.
    quoted: bool,
    parts: Vec<Part>,
}

impl Word {
    fn lit(&mut self, c: char) {
        self.value.push(c);
        if let Some(Part::Lit(text)) = self.parts.last_mut() {
            text.push(c);
        } else {
            self.parts.push(Part::Lit(c.to_string()));
        }
    }

    /// An expansion kept as its source text in `value`.
    fn expansion(&mut self, source: &str, part: Part) {
        self.has_expansion = true;
        self.value.push_str(source);
        self.parts.push(part);
    }
}

/// Parse a whole script (top level, or the text of a backtick / eval / heredoc).
fn parse_script(text: &str, depth: usize, scope: Vec<usize>, out: &mut Output) -> PResult<()> {
    if depth > MAX_DEPTH {
        return Err("command nesting is too deep".into());
    }
    let mut p = Parser::new(text, depth, scope);
    p.parse_list(TOP, out)?;
    if !p.heredocs.is_empty() {
        return Err("heredoc without a body".into());
    }
    Ok(())
}

/// Scan an unquoted heredoc body for expansions (bodies are expanded like
/// double-quoted text, except that `"` is not special).
fn scan_heredoc_body(text: &str, depth: usize, out: &mut Output) -> PResult<()> {
    if depth > MAX_DEPTH {
        return Err("command nesting is too deep".into());
    }
    let mut p = Parser::new(text, depth, Vec::new());
    let mut word = Word::default();
    p.parse_double_quoted_body(&mut word, out, false)?;
    if !p.heredocs.is_empty() {
        return Err("heredoc inside a heredoc body".into());
    }
    Ok(())
}

struct Parser {
    chars: Vec<char>,
    pos: usize,
    depth: usize,
    heredocs: Vec<PendingHeredoc>,
    /// Bindings visible here (indexes into `Output::bindings`).
    scope: Vec<usize>,
    /// Compound commands (`if`, loops, `{ }`, `case`) around this point.
    compound: usize,
    /// Inside a `while`/`until` condition: the names its `read`s set.
    reads: Option<Vec<String>>,
    /// The assignment-only command just parsed may become a binding
    /// (`parse_list` decides).
    pending: Option<usize>,
}

fn is_meta(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\n' | ';' | '&' | '|' | '(' | ')' | '<' | '>')
}

fn is_name_start(c: char) -> bool {
    c == '_' || c.is_ascii_alphabetic()
}

fn is_name_char(c: char) -> bool {
    c == '_' || c.is_ascii_alphanumeric()
}

impl Parser {
    fn new(text: &str, depth: usize, scope: Vec<usize>) -> Self {
        Parser { chars: text.chars().collect(), pos: 0, depth, heredocs: Vec::new(), scope, compound: 0, reads: None, pending: None }
    }

    /// A reserved word at the current position (followed by a separator).
    fn reserved_word(&self) -> Option<String> {
        let mut end = self.pos;
        while let Some(c) = self.chars.get(end) {
            if c.is_ascii_alphabetic() || matches!(c, '{' | '}' | '!' | '[' | ']') {
                end += 1;
            } else {
                break;
            }
        }
        if end == self.pos || self.chars.get(end).is_some_and(|c| !is_meta(*c)) {
            return None;
        }
        let word = self.slice(self.pos, end);
        RESERVED_WORDS.contains(&word.as_str()).then_some(word)
    }

    /// Consume the reserved word `word`, or fail.
    fn expect_reserved(&mut self, word: &str) -> PResult<()> {
        if self.reserved_word().as_deref() == Some(word) {
            self.pos += word.chars().count();
            Ok(())
        } else {
            Err(format!("expected '{word}'"))
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn peek_at(&self, offset: usize) -> Option<char> {
        self.chars.get(self.pos + offset).copied()
    }

    fn starts_with(&self, s: &str) -> bool {
        s.chars().enumerate().all(|(i, c)| self.peek_at(i) == Some(c))
    }

    fn slice(&self, start: usize, end: usize) -> String {
        self.chars[start..end].iter().collect()
    }

    /// Skip spaces, tabs, line continuations and comments (not newlines).
    fn skip_blanks(&mut self) {
        loop {
            match self.peek() {
                Some(' ') | Some('\t') => self.pos += 1,
                Some('\\') if self.peek_at(1) == Some('\n') => self.pos += 2,
                Some('#') => {
                    // Only reached at the start of a word: a comment to end of line.
                    while let Some(c) = self.peek() {
                        if c == '\n' {
                            break;
                        }
                        self.pos += 1;
                    }
                }
                _ => break,
            }
        }
    }

    /// Consume a newline token and read any pending heredoc bodies after it.
    fn consume_newline(&mut self, out: &mut Output) -> PResult<()> {
        debug_assert_eq!(self.peek(), Some('\n'));
        self.pos += 1;
        let pending = std::mem::take(&mut self.heredocs);
        for heredoc in pending {
            let body = self.read_heredoc_body(&heredoc)?;
            if !heredoc.quoted {
                scan_heredoc_body(&body, self.depth + 1, out)?;
            }
            out.heredocs[heredoc.id] = Some(body);
        }
        Ok(())
    }

    fn read_heredoc_body(&mut self, heredoc: &PendingHeredoc) -> PResult<String> {
        let mut body = String::new();
        loop {
            if self.pos >= self.chars.len() {
                return Err(format!(
                    "heredoc delimited by '{}' is not terminated",
                    heredoc.delimiter
                ));
            }
            let start = self.pos;
            while let Some(c) = self.peek() {
                if c == '\n' {
                    break;
                }
                self.pos += 1;
            }
            let line = self.slice(start, self.pos);
            let at_newline = self.peek() == Some('\n');
            if at_newline {
                self.pos += 1;
            }
            let compare = if heredoc.strip_tabs {
                line.trim_start_matches('\t')
            } else {
                line.as_str()
            };
            if compare == heredoc.delimiter {
                return Ok(body);
            }
            body.push_str(&line);
            body.push('\n');
            if !at_newline {
                return Err(format!(
                    "heredoc delimited by '{}' is not terminated",
                    heredoc.delimiter
                ));
            }
        }
    }

    /// Skip blanks and newlines (allowed after `&&`, `||` and `|`).
    fn skip_blanks_and_newlines(&mut self, out: &mut Output) -> PResult<()> {
        loop {
            self.skip_blanks();
            if self.peek() == Some('\n') {
                self.consume_newline(out)?;
            } else {
                return Ok(());
            }
        }
    }

    /// Parse a list of pipelines until end of input, the closing `)` of
    /// `term` (consumed), one of its reserved words (not consumed) or, in a
    /// `case` item, `;;`/`;&`/`;;&` (consumed). Returns the word or `;;` that
    /// ended it.
    fn parse_list(&mut self, term: Term, out: &mut Output) -> PResult<Option<String>> {
        // Separator seen after the last pipeline; recorded only if another
        // pipeline follows (a trailing `;` or newline separates nothing).
        let mut pending_sep: Option<&'static str> = None;
        let mut have_pipeline = false;

        loop {
            self.skip_blanks();
            match self.peek() {
                None => {
                    if term.close.is_some() {
                        return Err("unterminated '(' or '$('".into());
                    }
                    if !term.words.is_empty() {
                        return Err(format!("missing '{}'", term.words.join("' or '")));
                    }
                    return Ok(None);
                }
                Some('\n') => {
                    self.consume_newline(out)?;
                    if have_pipeline && pending_sep.is_none() {
                        pending_sep = Some("\n");
                    }
                    continue;
                }
                Some(')') => {
                    if term.close == Some(')') {
                        if !self.heredocs.is_empty() {
                            return Err("heredoc body missing before ')'".into());
                        }
                        self.pos += 1;
                        return Ok(None);
                    }
                    return Err("unexpected ')'".into());
                }
                Some(';') if term.case_item && matches!(self.peek_at(1), Some(';') | Some('&')) => {
                    return Ok(Some(self.case_end()));
                }
                Some(';') | Some('&') | Some('|') => {
                    return Err(format!(
                        "unexpected '{}' with no command before it",
                        self.peek().unwrap_or(' ')
                    ));
                }
                _ => {}
            }
            if let Some(word) = self.reserved_word() {
                if term.words.contains(&word.as_str()) {
                    return Ok(Some(word));
                }
            }

            if let Some(sep) = pending_sep.take() {
                out.operators.push(OperatorInfo { op: sep.to_string() });
            }
            // An assignment-only command first in an and-or list at the top
            // level binds its names for what follows (unless it is piped or
            // run in the background).
            let top = self.depth == 0 && self.compound == 0;
            let pipes_before = out.pipes.len();
            self.parse_pipeline(out, top)?;
            let candidate = self.pending.take().filter(|_| out.pipes.len() == pipes_before);
            have_pipeline = true;

            // `&&` / `||` chains: another pipeline must follow (newlines allowed).
            loop {
                self.skip_blanks();
                let op = if self.starts_with("&&") {
                    "&&"
                } else if self.starts_with("||") {
                    "||"
                } else {
                    break;
                };
                self.pos += 2;
                out.operators.push(OperatorInfo { op: op.into() });
                self.skip_blanks_and_newlines(out)?;
                match self.peek() {
                    None | Some(')') | Some(';') | Some('&') | Some('|') => {
                        return Err(format!("'{}' is missing a command after it", op));
                    }
                    _ => self.parse_pipeline(out, false)?,
                }
            }

            // What follows the and-or list?
            let mut background = false;
            let mut ended: Option<String> = None;
            match self.peek() {
                None | Some('\n') | Some(')') => {}
                Some(';') => {
                    if term.case_item && matches!(self.peek_at(1), Some(';') | Some('&')) {
                        ended = Some(self.case_end());
                    } else if self.peek_at(1) == Some(';') {
                        return Err("';;' outside of a case statement".into());
                    } else {
                        self.pos += 1;
                        pending_sep = Some(";");
                    }
                }
                Some('&') => {
                    // Background: always recorded, even when trailing.
                    self.pos += 1;
                    background = true;
                    out.operators.push(OperatorInfo { op: "&".into() });
                }
                Some(c) => return Err(format!("unexpected '{}'", c)),
            }
            if let Some(index) = candidate {
                let assignments = out.commands[index].assignment_values.clone();
                for (name, parts) in assignments {
                    if background || name.ends_with('+') {
                        out.taint(name.trim_end_matches('+'));
                    } else {
                        out.bound.insert(name.clone());
                        out.bindings.push(Binding { name, kind: BindingKind::Words(vec![parts]), scope: self.scope.clone() });
                        self.scope.push(out.bindings.len() - 1);
                    }
                }
            }
            if ended.is_some() {
                return Ok(ended);
            }
        }
    }

    /// Consume `;;`, `;&` or `;;&` (a `case` item's end).
    fn case_end(&mut self) -> String {
        let end = if self.starts_with(";;&") {
            ";;&"
        } else if self.starts_with(";;") {
            ";;"
        } else {
            ";&"
        };
        self.pos += end.len();
        end.to_string()
    }

    fn parse_pipeline(&mut self, out: &mut Output, binding_slot: bool) -> PResult<()> {
        self.skip_blanks();
        let mut slot = binding_slot;
        if self.reserved_word().as_deref() == Some("!") {
            self.pos += 1;
            self.skip_blanks();
            slot = false;
        }
        let start = out.commands.len();
        self.parse_command(out, None, slot)?;
        loop {
            self.skip_blanks();
            if self.peek() == Some('|') && self.peek_at(1) != Some('|') {
                let op = if self.peek_at(1) == Some('&') {
                    self.pos += 2;
                    "|&"
                } else {
                    self.pos += 1;
                    "|"
                };
                out.pipes.push(PipeInfo { op: op.into() });
                self.skip_blanks_and_newlines(out)?;
                match self.peek() {
                    None | Some(')') | Some(';') | Some('&') | Some('|') => {
                        return Err("pipe is missing a command after it".into())
                    }
                    _ => {
                        let element = out.commands.len();
                        self.parse_command(out, Some((start..element).collect()), false)?;
                        for c in &mut out.commands[element..] {
                            c.stdin_piped = true;
                        }
                    }
                }
            } else {
                return Ok(());
            }
        }
    }

    /// `upstream`: the commands piped into this one, for a `while read`.
    fn parse_command(&mut self, out: &mut Output, upstream: Option<Vec<usize>>, binding_slot: bool) -> PResult<()> {
        self.skip_blanks();
        let start = out.commands.len();
        if self.peek() == Some('(') {
            if self.peek_at(1) == Some('(') {
                return Err("arithmetic command '((' is not supported".into());
            }
            self.pos += 1;
            self.enter()?;
            self.parse_list(Term { close: Some(')'), words: &[], case_item: false }, out)?;
            self.leave();
            return self.after_compound(out, start, "')'");
        }
        let Some(word) = self.reserved_word() else {
            return self.parse_simple_command(out, binding_slot);
        };
        match word.as_str() {
            "{" => {
                self.pos += 1;
                self.compound += 1;
                self.parse_list(Term { close: None, words: &["}"], case_item: false }, out)?;
                self.expect_reserved("}")?;
                self.compound -= 1;
            }
            "if" => {
                self.pos += 2;
                self.compound += 1;
                loop {
                    self.parse_list(Term { close: None, words: &["then"], case_item: false }, out)?;
                    self.expect_reserved("then")?;
                    match self.parse_list(Term { close: None, words: &["elif", "else", "fi"], case_item: false }, out)?.as_deref() {
                        Some("elif") => self.expect_reserved("elif")?,
                        Some("else") => {
                            self.expect_reserved("else")?;
                            self.parse_list(Term { close: None, words: &["fi"], case_item: false }, out)?;
                            self.expect_reserved("fi")?;
                            break;
                        }
                        _ => {
                            self.expect_reserved("fi")?;
                            break;
                        }
                    }
                }
                self.compound -= 1;
            }
            "while" | "until" => {
                self.pos += word.len();
                self.compound += 1;
                let outer = self.reads.replace(Vec::new());
                let condition = self.parse_list(Term { close: None, words: &["do"], case_item: false }, out);
                let names = std::mem::replace(&mut self.reads, outer).unwrap_or_default();
                condition?;
                self.expect_reserved("do")?;
                let kind = match upstream {
                    Some(up) if !up.is_empty() => BindingKind::Piped(up),
                    _ => BindingKind::Computed,
                };
                let ids: Vec<usize> = names.iter().map(|name| self.bind(out, name, kind.clone())).collect();
                self.parse_list(Term { close: None, words: &["done"], case_item: false }, out)?;
                self.expect_reserved("done")?;
                self.unbind(out, &ids);
                self.compound -= 1;
            }
            "for" => {
                self.pos += 3;
                self.skip_blanks();
                let name = self.parse_word(out)?;
                if name.quoted || name.has_expansion || !is_name(&name.value) {
                    return Err("'for' needs a variable name ('for ((' is not supported)".into());
                }
                self.skip_blanks_and_newlines(out)?;
                let mut kind = BindingKind::Computed;
                if self.reserved_word().as_deref() == Some("in") {
                    self.pos += 2;
                    let mut words = Vec::new();
                    loop {
                        self.skip_blanks();
                        match self.peek() {
                            None => return Err("'for' is missing 'do'".into()),
                            Some('\n') => {
                                self.consume_newline(out)?;
                                break;
                            }
                            Some(';') => {
                                self.pos += 1;
                                break;
                            }
                            _ => {
                                let word = self.parse_word(out)?;
                                if word.raw.is_empty() {
                                    return Err(format!("unexpected '{}' in a 'for' list", self.peek().unwrap_or(' ')));
                                }
                                words.push(word.parts);
                            }
                        }
                    }
                    kind = BindingKind::Words(words);
                } else if self.peek() == Some(';') {
                    self.pos += 1;
                }
                self.skip_blanks_and_newlines(out)?;
                self.expect_reserved("do")?;
                self.compound += 1;
                let id = self.bind(out, &name.value, kind);
                self.parse_list(Term { close: None, words: &["done"], case_item: false }, out)?;
                self.expect_reserved("done")?;
                self.unbind(out, &[id]);
                self.compound -= 1;
            }
            "case" => {
                self.pos += 4;
                self.skip_blanks();
                if self.parse_word(out)?.raw.is_empty() {
                    return Err("'case' needs a word".into());
                }
                self.skip_blanks_and_newlines(out)?;
                self.expect_reserved("in")?;
                self.compound += 1;
                loop {
                    self.skip_blanks_and_newlines(out)?;
                    if self.reserved_word().as_deref() == Some("esac") {
                        self.pos += 4;
                        break;
                    }
                    if self.peek() == Some('(') {
                        self.pos += 1;
                    }
                    loop {
                        self.skip_blanks();
                        if self.parse_word(out)?.raw.is_empty() {
                            return Err("a 'case' pattern is missing".into());
                        }
                        self.skip_blanks();
                        match self.peek() {
                            Some('|') => self.pos += 1,
                            Some(')') => {
                                self.pos += 1;
                                break;
                            }
                            _ => return Err("a 'case' pattern must end with ')'".into()),
                        }
                    }
                    match self.parse_list(Term { close: None, words: &["esac"], case_item: true }, out)?.as_deref() {
                        Some("esac") => {
                            self.pos += 4;
                            break;
                        }
                        Some(_) => {}
                        None => return Err("'case' is missing 'esac'".into()),
                    }
                }
                self.compound -= 1;
            }
            other => return Err(format!("compound command '{other}' is not supported")),
        }
        self.after_compound(out, start, &format!("'{word}'"))
    }

    /// Redirections after a subshell or compound command apply to every
    /// command inside it.
    fn after_compound(&mut self, out: &mut Output, start: usize, what: &str) -> PResult<()> {
        let mut redirections = Vec::new();
        loop {
            self.skip_blanks();
            match self.peek() {
                None | Some('\n') | Some(';') | Some('|') | Some(')') => break,
                Some('&') if self.peek_at(1) != Some('>') => break,
                _ => {
                    if let Some(redir) = self.try_parse_redirection(out)? {
                        redirections.push(redir);
                    } else {
                        return Err(format!("unexpected text after {what}"));
                    }
                }
            }
        }
        for c in &mut out.commands[start..] {
            c.redirections.extend(redirections.iter().cloned());
        }
        out.redirections.extend(redirections);
        Ok(())
    }

    /// Make `name` visible with `kind` from here.
    fn bind(&mut self, out: &mut Output, name: &str, kind: BindingKind) -> usize {
        out.bound.insert(name.to_string());
        out.bindings.push(Binding { name: name.to_string(), kind, scope: self.scope.clone() });
        let id = out.bindings.len() - 1;
        self.scope.push(id);
        id
    }

    /// A loop ended: its variables keep a value set while it ran.
    fn unbind(&mut self, out: &mut Output, ids: &[usize]) {
        self.scope.retain(|id| !ids.contains(id));
        for &id in ids {
            let name = out.bindings[id].name.clone();
            self.bind(out, &name, BindingKind::Computed);
        }
    }

    fn enter(&mut self) -> PResult<()> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return Err("command nesting is too deep".into());
        }
        Ok(())
    }

    fn leave(&mut self) {
        self.depth -= 1;
    }

    fn parse_simple_command(&mut self, out: &mut Output, binding_slot: bool) -> PResult<()> {
        let mut words: Vec<Word> = Vec::new();
        let mut assignments: Vec<String> = Vec::new();
        let mut assignment_values: Vec<(String, Vec<Part>)> = Vec::new();
        let mut redirections: Vec<RedirectionInfo> = Vec::new();

        loop {
            self.skip_blanks();
            match self.peek() {
                None | Some('\n') | Some(';') | Some('|') | Some(')') => break,
                Some('&') if self.peek_at(1) != Some('>') => break,
                Some('(') => {
                    return Err("unexpected '(' (function definitions and arrays are not supported)".into())
                }
                _ => {}
            }

            if let Some(redir) = self.try_parse_redirection(out)? {
                redirections.push(redir);
                continue;
            }

            let word = self.parse_word(out)?;
            if word.raw.is_empty() {
                return Err(format!("unexpected '{}'", self.peek().unwrap_or(' ')));
            }

            if words.is_empty() {
                if is_assignment(&word.raw) {
                    let eq = word.raw.find('=').unwrap_or(0);
                    let name = word.raw[..eq].to_string();
                    let mut parts = word.parts.clone();
                    if let Some(Part::Lit(first)) = parts.first_mut() {
                        *first = first[eq + 1..].to_string();
                    }
                    assignment_values.push((name, parts));
                    assignments.push(word.raw);
                    continue;
                }
                if !word.quoted && RESERVED_WORDS.contains(&word.raw.as_str()) {
                    return Err(format!(
                        "compound command '{}' is not supported here",
                        word.raw
                    ));
                }
                if word.raw.starts_with("((") {
                    return Err("arithmetic command is not supported".into());
                }
            }
            words.push(word);
        }

        if words.is_empty() && assignments.is_empty() && redirections.is_empty() {
            return Err("empty command".into());
        }

        out.redirections.extend(redirections.iter().cloned());

        let (program, program_is_literal) = match words.first() {
            Some(w) => (w.value.clone(), !w.has_expansion),
            None => (String::new(), true),
        };
        let args: Vec<String> = words.iter().skip(1).map(|w| w.value.clone()).collect();

        let mut parts: Vec<String> = Vec::new();
        if !program.is_empty() {
            parts.push(program.clone());
        } else if words.is_empty() {
            // Assignment-only or redirection-only command: show the assignments.
            parts.extend(assignments.iter().cloned());
        }
        parts.extend(args.iter().cloned());
        parts.extend(redirections.iter().map(|r| r.display()));
        let full = parts.join(" ");

        // Names this command binds in ways that are not followed.
        if words.is_empty() {
            if binding_slot {
                self.pending = Some(out.commands.len());
            } else {
                for (name, _) in &assignment_values {
                    out.taint(name.trim_end_matches('+'));
                }
            }
        } else {
            for (name, _) in &assignment_values {
                out.taint(name.trim_end_matches('+'));
            }
        }
        if program_is_literal {
            self.note_builtin(&program, &args, out);
        }

        // `eval` runs its arguments as a script: parse them too.
        if program_is_literal && program == "eval" && !args.is_empty() {
            let script = args.join(" ");
            parse_script(&script, self.depth + 1, self.scope.clone(), out)
                .map_err(|e| format!("could not parse eval argument: {}", e))?;
        }

        out.commands.push(CommandInfo {
            program,
            args,
            full,
            assignments,
            redirections,
            program_is_literal,
            arg_parts: words.iter().skip(1).map(|w| w.parts.clone()).collect(),
            assignment_values,
            scope: self.scope.clone(),
            stdin_piped: false,
        });
        Ok(())
    }

    /// Builtins that set variables: `read` in a `while` condition binds its
    /// names for the loop; everything else marks them as not followed.
    fn note_builtin(&mut self, program: &str, args: &[String], out: &mut Output) {
        let operands = || args.iter().filter(|a| !a.starts_with('-'));
        match program {
            "read" => {
                let mut names = Vec::new();
                let mut i = 0;
                while i < args.len() {
                    let a = &args[i];
                    if a == "-a" {
                        if let Some(n) = args.get(i + 1) {
                            out.taint(n);
                        }
                        i += 2;
                        continue;
                    }
                    if a.starts_with('-') {
                        // Options that take a value.
                        if matches!(a.as_str(), "-d" | "-i" | "-n" | "-N" | "-p" | "-t" | "-u") {
                            i += 1;
                        }
                    } else {
                        names.push(a.clone());
                    }
                    i += 1;
                }
                if names.is_empty() {
                    names.push("REPLY".into());
                }
                match self.reads.as_mut() {
                    Some(collected) if self.compound > 0 => collected.extend(names),
                    _ => names.iter().for_each(|n| out.taint(n)),
                }
            }
            "export" | "declare" | "typeset" | "local" | "readonly" | "unset" => {
                for a in operands() {
                    out.taint(a.split(['=', '+']).next().unwrap_or(a));
                }
            }
            "let" => {
                for a in args {
                    let name: String = a.chars().take_while(|c| is_name_char(*c)).collect();
                    out.taint(&name);
                }
            }
            "printf" => {
                if let Some(i) = args.iter().position(|a| a == "-v") {
                    if let Some(n) = args.get(i + 1) {
                        out.taint(n);
                    }
                }
            }
            "mapfile" | "readarray" => {
                out.taint("MAPFILE");
                for a in operands() {
                    out.taint(a);
                }
            }
            "getopts" => {
                if let Some(n) = args.get(1) {
                    out.taint(n);
                }
            }
            "source" | "." | "eval" => out.opaque = true,
            _ => {}
        }
    }

    /// Try to parse a redirection at the current position. Returns Ok(None)
    /// (without consuming anything) if there is none.
    fn try_parse_redirection(&mut self, out: &mut Output) -> PResult<Option<RedirectionInfo>> {
        let start = self.pos;

        // Optional numeric fd prefix, only when directly followed by < or >.
        let mut digits_end = self.pos;
        while let Some(c) = self.chars.get(digits_end) {
            if c.is_ascii_digit() {
                digits_end += 1;
            } else {
                break;
            }
        }
        let fd = if digits_end > self.pos
            && matches!(self.chars.get(digits_end), Some('<') | Some('>'))
        {
            let fd = self.slice(self.pos, digits_end);
            self.pos = digits_end;
            Some(fd)
        } else {
            None
        };

        // Process substitution is a word, not a redirection.
        if fd.is_none() && (self.starts_with("<(") || self.starts_with(">(")) {
            self.pos = start;
            return Ok(None);
        }

        const OPS: &[&str] = &[
            "&>>", "&>", "<<<", "<<-", "<<", "<>", "<&", ">>", ">|", ">&", "<", ">",
        ];
        let op = OPS.iter().find(|op| self.starts_with(op)).copied();
        let Some(op) = op else {
            self.pos = start;
            return Ok(None);
        };
        if fd.is_some() && op.starts_with('&') {
            self.pos = start;
            return Ok(None);
        }
        self.pos += op.chars().count();

        self.skip_blanks_no_comment();
        if self.peek() == Some('#') {
            return Err("redirection is missing its target".into());
        }
        // The target may itself be a process substitution (`cat < <(ls)`);
        // parse_word handles that.
        let target = self.parse_word(out)?;
        if target.raw.is_empty() {
            return Err("redirection is missing its target".into());
        }

        let mut heredoc = None;
        if op == "<<" || op == "<<-" {
            if target.has_expansion || target.raw.contains('$') || target.raw.contains('`') {
                return Err("heredoc delimiter with expansions is not supported".into());
            }
            out.heredocs.push(None);
            heredoc = Some(out.heredocs.len() - 1);
            self.heredocs.push(PendingHeredoc {
                delimiter: target.value.clone(),
                strip_tabs: op == "<<-",
                quoted: target.quoted,
                id: out.heredocs.len() - 1,
            });
        }

        Ok(Some(RedirectionInfo {
            fd,
            op: op.to_string(),
            target: target.value,
            parts: target.parts,
            heredoc,
        }))
    }

    fn skip_blanks_no_comment(&mut self) {
        loop {
            match self.peek() {
                Some(' ') | Some('\t') => self.pos += 1,
                Some('\\') if self.peek_at(1) == Some('\n') => self.pos += 2,
                _ => break,
            }
        }
    }

    /// Parse one word in unquoted context.
    fn parse_word(&mut self, out: &mut Output) -> PResult<Word> {
        let start = self.pos;
        let mut word = Word::default();

        // Process substitution at the start of a word.
        if self.starts_with("<(") || self.starts_with(">(") {
            self.pos += 2;
            self.enter()?;
            self.parse_list(Term { close: Some(')'), words: &[], case_item: false }, out)?;
            self.leave();
            let text = self.slice(start, self.pos);
            word.expansion(&text, Part::Computed);
        }

        while let Some(c) = self.peek() {
            if is_meta(c) {
                break;
            }
            match c {
                '\\' => match self.peek_at(1) {
                    Some('\n') => self.pos += 2,
                    Some(next) => {
                        word.lit(next);
                        word.quoted = true;
                        self.pos += 2;
                    }
                    None => return Err("trailing backslash".into()),
                },
                '\'' => {
                    self.pos += 1;
                    word.quoted = true;
                    loop {
                        match self.peek() {
                            None => return Err("unterminated single quote".into()),
                            Some('\'') => {
                                self.pos += 1;
                                break;
                            }
                            Some(ch) => {
                                word.lit(ch);
                                self.pos += 1;
                            }
                        }
                    }
                    // `''` alone is still a (empty) literal part.
                    if word.parts.is_empty() {
                        word.parts.push(Part::Lit(String::new()));
                    }
                }
                '"' => {
                    self.pos += 1;
                    word.quoted = true;
                    self.parse_double_quoted_body(&mut word, out, true)?;
                }
                '$' => self.parse_dollar(&mut word, out, false)?,
                '`' => self.parse_backtick(&mut word, out, false)?,
                _ => {
                    word.lit(c);
                    self.pos += 1;
                }
            }
        }

        word.raw = self.slice(start, self.pos);
        Ok(word)
    }

    /// Parse the inside of a double-quoted string (opening quote already
    /// consumed). With `in_quotes` false this scans a heredoc body to the end
    /// of input instead, where `"` is an ordinary character.
    fn parse_double_quoted_body(
        &mut self,
        word: &mut Word,
        out: &mut Output,
        in_quotes: bool,
    ) -> PResult<()> {
        loop {
            match self.peek() {
                None => {
                    if in_quotes {
                        return Err("unterminated double quote".into());
                    }
                    return Ok(());
                }
                Some('"') if in_quotes => {
                    self.pos += 1;
                    if word.parts.is_empty() {
                        word.parts.push(Part::Lit(String::new()));
                    }
                    return Ok(());
                }
                Some('\\') => match self.peek_at(1) {
                    Some('\n') => self.pos += 2,
                    Some(next @ ('$' | '`' | '\\')) => {
                        word.lit(next);
                        self.pos += 2;
                    }
                    Some('"') if in_quotes => {
                        word.lit('"');
                        self.pos += 2;
                    }
                    Some(_) => {
                        word.lit('\\');
                        self.pos += 1;
                    }
                    None => {
                        if in_quotes {
                            return Err("unterminated double quote".into());
                        }
                        word.lit('\\');
                        self.pos += 1;
                    }
                },
                Some('$') => self.parse_dollar(word, out, true)?,
                Some('`') => self.parse_backtick(word, out, in_quotes)?,
                Some(c) => {
                    word.lit(c);
                    self.pos += 1;
                }
            }
        }
    }

    /// Parse a `$` expansion (unquoted, or inside double quotes / a heredoc
    /// body when `in_dquote` is set, where `$'` and `$"` are a literal `$`).
    fn parse_dollar(&mut self, word: &mut Word, out: &mut Output, in_dquote: bool) -> PResult<()> {
        let start = self.pos;
        match self.peek_at(1) {
            Some('(') => {
                if self.peek_at(2) == Some('(') {
                    return Err("arithmetic expansion '$((' is not supported".into());
                }
                self.pos += 2;
                self.enter()?;
                self.parse_list(Term { close: Some(')'), words: &[], case_item: false }, out)?;
                self.leave();
                let text = self.slice(start, self.pos);
                word.expansion(&text, Part::Computed);
            }
            Some('{') => {
                self.pos += 2;
                loop {
                    match self.peek() {
                        None => return Err("unterminated '${'".into()),
                        Some('}') => {
                            self.pos += 1;
                            break;
                        }
                        Some('$' | '`' | '\'' | '"' | '\\' | '{' | '\n') => {
                            return Err(
                                "'${...}' containing quotes or nested expansions is not supported"
                                    .into(),
                            )
                        }
                        Some(_) => self.pos += 1,
                    }
                }
                let text = self.slice(start, self.pos);
                let inner = &text[2..text.len() - 1];
                let part = if is_name(inner) { Part::Var(inner.to_string()) } else { Part::Opaque };
                word.expansion(&text, part);
            }
            Some('\'' | '"') if in_dquote => {
                word.lit('$');
                self.pos += 1;
            }
            Some('\'') => return Err("ANSI-C quoting ($'...') is not supported".into()),
            Some('"') => return Err("locale quoting ($\"...\") is not supported".into()),
            Some('[') => return Err("arithmetic expansion '$[' is not supported".into()),
            Some(c) if is_name_start(c) => {
                self.pos += 1;
                while let Some(ch) = self.peek() {
                    if is_name_char(ch) {
                        self.pos += 1;
                    } else {
                        break;
                    }
                }
                let text = self.slice(start, self.pos);
                word.expansion(&text, Part::Var(text[1..].to_string()));
            }
            Some(c) if c.is_ascii_digit() || matches!(c, '@' | '*' | '#' | '?' | '-' | '$' | '!') => {
                self.pos += 2;
                let text = self.slice(start, self.pos);
                let part = if matches!(c, '#' | '?' | '-' | '$' | '!') { Part::Computed } else { Part::Opaque };
                word.expansion(&text, part);
            }
            _ => {
                // A lone `$` is literal.
                word.lit('$');
                self.pos += 1;
            }
        }
        Ok(())
    }

    /// Parse a backtick command substitution. Its text is unescaped the way
    /// bash does and then parsed as a script of its own.
    fn parse_backtick(&mut self, word: &mut Word, out: &mut Output, in_dquote: bool) -> PResult<()> {
        let start = self.pos;
        self.pos += 1;
        let mut inner = String::new();
        loop {
            match self.peek() {
                None => return Err("unterminated backtick".into()),
                Some('`') => {
                    self.pos += 1;
                    break;
                }
                Some('\\') => match self.peek_at(1) {
                    Some(next @ ('$' | '`' | '\\')) => {
                        inner.push(next);
                        self.pos += 2;
                    }
                    Some('"') if in_dquote => {
                        inner.push('"');
                        self.pos += 2;
                    }
                    Some(_) => {
                        inner.push('\\');
                        self.pos += 1;
                    }
                    None => return Err("unterminated backtick".into()),
                },
                Some(c) => {
                    inner.push(c);
                    self.pos += 1;
                }
            }
        }
        parse_script(&inner, self.depth + 1, self.scope.clone(), out)
            .map_err(|e| format!("could not parse backtick substitution: {}", e))?;
        let text = self.slice(start, self.pos);
        word.expansion(&text, Part::Computed);
        Ok(())
    }
}

/// A valid variable name.
fn is_name(s: &str) -> bool {
    let mut chars = s.chars();
    chars.next().is_some_and(is_name_start) && chars.all(is_name_char)
}

/// `NAME=...` or `NAME+=...` with an unquoted, valid name.
fn is_assignment(raw: &str) -> bool {
    let Some(eq) = raw.find('=') else {
        return false;
    };
    let name = raw[..eq].strip_suffix('+').unwrap_or(&raw[..eq]);
    let mut chars = name.chars();
    match chars.next() {
        Some(c) if is_name_start(c) => chars.all(is_name_char),
        _ => false,
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(cmd: &str) -> ParsedBashCommand {
        let parsed = parse_bash_command(cmd);
        assert!(parsed.success, "expected '{}' to parse, got error: {:?}", cmd, parsed.error);
        parsed
    }

    fn fails(cmd: &str) {
        let parsed = parse_bash_command(cmd);
        assert!(!parsed.success, "expected '{}' to fail, got: {:?}", cmd, parsed.commands);
    }

    fn programs(cmd: &str) -> Vec<String> {
        ok(cmd).commands.unwrap().into_iter().map(|c| c.program).collect()
    }

    fn ops(cmd: &str) -> Vec<String> {
        ok(cmd).operators.unwrap().into_iter().map(|o| o.op).collect()
    }

    #[test]
    fn simple_command() {
        let p = ok("ls -la /tmp");
        let cmds = p.commands.unwrap();
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0].program, "ls");
        assert_eq!(cmds[0].args, vec!["-la", "/tmp"]);
        assert_eq!(cmds[0].full, "ls -la /tmp");
        assert!(p.operators.unwrap().is_empty());
        assert!(p.pipes.unwrap().is_empty());
    }

    #[test]
    fn quoting_is_removed() {
        let p = ok(r#"echo 'a b' "c d" e\ f"#);
        let c = &p.commands.unwrap()[0];
        assert_eq!(c.args, vec!["a b", "c d", "e f"]);
        // `$` before a closing quote is literal inside double quotes.
        let p = ok(r#"echo "cost: $" "a $'b'""#);
        assert_eq!(p.commands.unwrap()[0].args, vec!["cost: $", "a $'b'"]);
        // Backslash-escaped quote and dollar inside double quotes.
        let p = ok(r#"echo "say \"hi\" \$HOME""#);
        assert_eq!(p.commands.unwrap()[0].args, vec![r#"say "hi" $HOME"#]);
    }

    #[test]
    fn quoted_program_names_resolve() {
        assert_eq!(programs(r#""rm" -rf x"#), vec!["rm"]);
        assert_eq!(programs(r"r\m -rf x"), vec!["rm"]);
        assert_eq!(programs("'r'm -rf x"), vec!["rm"]);
        assert_eq!(programs(r#"r"m" x"#), vec!["rm"]);
    }

    #[test]
    fn separators_inside_quotes_are_not_operators() {
        let p = ok(r#"echo "a; rm -rf x && b | c""#);
        assert_eq!(p.commands.as_ref().unwrap().len(), 1);
        assert!(p.operators.unwrap().is_empty());
        assert!(p.pipes.unwrap().is_empty());
        let p = ok("echo 'a; touch x'");
        assert_eq!(p.commands.unwrap().len(), 1);
        assert!(p.operators.unwrap().is_empty());
        let p = ok(r"echo a\;touch x");
        assert_eq!(p.commands.unwrap().len(), 1);
        assert!(p.operators.unwrap().is_empty());
    }

    #[test]
    fn list_operators() {
        assert_eq!(ops("a && b"), vec!["&&"]);
        assert_eq!(ops("a || b"), vec!["||"]);
        assert_eq!(ops("a; b"), vec![";"]);
        assert_eq!(ops("a & b"), vec!["&"]);
        assert_eq!(ops("a &"), vec!["&"]);
        assert_eq!(ops("a\nb"), vec!["\n"]);
        assert_eq!(ops("a && b || c; d"), vec!["&&", "||", ";"]);
        assert_eq!(programs("a && b || c; d"), vec!["a", "b", "c", "d"]);
        // Trailing separators separate nothing.
        assert!(ops("ls;").is_empty());
        assert!(ops("ls\n").is_empty());
        assert!(ops("\n\nls\n\n").is_empty());
        // No spaces needed.
        assert_eq!(programs("ls;rm x"), vec!["ls", "rm"]);
        assert_eq!(programs("ls&&rm x"), vec!["ls", "rm"]);
        // Newline after && is allowed.
        assert_eq!(programs("ls &&\n rm x"), vec!["ls", "rm"]);
    }

    #[test]
    fn pipes() {
        let p = ok("cat a | grep b |& wc -l");
        assert_eq!(p.pipes.unwrap().len(), 2);
        assert_eq!(programs("cat a|grep b"), vec!["cat", "grep"]);
    }

    #[test]
    fn redirections() {
        let p = ok("ls -la > out.txt 2>&1");
        let c = &p.commands.as_ref().unwrap()[0];
        assert_eq!(c.args, vec!["-la"]);
        assert_eq!(c.redirections.len(), 2);
        assert_eq!(c.redirections[0].op, ">");
        assert_eq!(c.redirections[0].target, "out.txt");
        assert!(c.redirections[0].writes_file());
        assert_eq!(c.redirections[1].fd.as_deref(), Some("2"));
        assert_eq!(c.redirections[1].op, ">&");
        assert!(!c.redirections[1].writes_file());
        assert_eq!(c.full, "ls -la > out.txt 2>& 1");
        assert_eq!(p.redirections.unwrap().len(), 2);

        let p = ok("cat <in.txt >>log 2>/dev/null &>all");
        let r = p.redirections.unwrap();
        let summary: Vec<(String, bool)> = r.iter().map(|r| (r.op.clone(), r.writes_file())).collect();
        assert_eq!(
            summary,
            vec![
                ("<".to_string(), false),
                (">>".to_string(), true),
                (">".to_string(), false),
                ("&>".to_string(), true)
            ]
        );
        // Redirection before the program.
        assert_eq!(programs("> out.txt echo hi"), vec!["echo"]);
        // `>&file` writes a file.
        assert!(ok("echo hi >&out").redirections.unwrap()[0].writes_file());
        // A word that merely contains digits is not an fd.
        let p = ok("echo a2>f");
        assert_eq!(p.commands.as_ref().unwrap()[0].args, vec!["a2"]);
    }

    #[test]
    fn dangerous_command_after_redirection_or_newline() {
        assert_eq!(programs("echo hi > /dev/null; rm -rf x"), vec!["echo", "rm"]);
        assert_eq!(programs("ls\nrm -rf x"), vec!["ls", "rm"]);
        assert_eq!(programs("ls 2>/dev/null\n\n  rm -rf x"), vec!["ls", "rm"]);
    }

    #[test]
    fn command_substitution_is_extracted() {
        assert_eq!(programs("echo $(rm -rf x)"), vec!["rm", "echo"]);
        assert_eq!(programs(r#"echo "$(rm -rf x)""#), vec!["rm", "echo"]);
        assert_eq!(programs("echo `rm -rf x`"), vec!["rm", "echo"]);
        assert_eq!(programs(r#"echo "`rm -rf x`""#), vec!["rm", "echo"]);
        assert_eq!(programs("ls $(echo $(rm x))"), vec!["rm", "echo", "ls"]);
        assert_eq!(programs(r"echo `echo \`rm x\``"), vec!["rm", "echo", "echo"]);
        // In an assignment.
        let p = ok("X=$(rm -rf x)");
        let cmds = p.commands.unwrap();
        assert_eq!(cmds.iter().map(|c| c.program.as_str()).collect::<Vec<_>>(), vec!["rm", ""]);
        assert_eq!(cmds[1].assignments, vec!["X=$(rm -rf x)"]);
        // In a redirection target.
        assert_eq!(programs("echo hi > $(rm x)"), vec!["rm", "echo"]);
        // Operators inside a substitution are seen.
        assert_eq!(ops("echo $(ls; rm x)"), vec![";"]);
        // `)` inside quotes within $( ) does not close it.
        assert_eq!(programs(r#"echo $(echo ")"; rm x)"#), vec!["echo", "rm", "echo"]);
    }

    #[test]
    fn single_quotes_prevent_substitution() {
        assert_eq!(programs("echo '$(rm -rf x)'"), vec!["echo"]);
        assert_eq!(programs(r"echo \`rm x\`"), vec!["echo"]);
    }

    #[test]
    fn substituted_program_is_not_literal() {
        let p = ok("$(echo rm) -rf x");
        let cmds = p.commands.unwrap();
        assert_eq!(cmds[1].program_is_literal, false);
        let p = ok("$CMD x");
        assert!(!p.commands.unwrap()[0].program_is_literal);
        let p = ok("ls $HOME ${HOME}");
        let c = &p.commands.unwrap()[0];
        assert!(c.program_is_literal);
        assert_eq!(c.args, vec!["$HOME", "${HOME}"]);
    }

    #[test]
    fn process_substitution_is_extracted() {
        assert_eq!(programs("diff <(ls a) <(ls b)"), vec!["ls", "ls", "diff"]);
        assert_eq!(programs("cat < <(rm x)"), vec!["rm", "cat"]);
        assert_eq!(programs("tee >(rm x)"), vec!["rm", "tee"]);
    }

    #[test]
    fn subshells() {
        assert_eq!(programs("(rm -rf x)"), vec!["rm"]);
        assert_eq!(programs("(cd a && rm x) > log"), vec!["cd", "rm"]);
        assert!(ok("(ls) > log").redirections.unwrap()[0].writes_file());
        assert_eq!(programs("ls | (rm x)"), vec!["ls", "rm"]);
        fails("(ls");
        fails("ls)");
        fails("(ls) foo");
    }

    #[test]
    fn env_assignment_prefixes() {
        let p = ok("FOO=bar BAZ='q x' rm -rf x");
        let c = &p.commands.unwrap()[0];
        assert_eq!(c.program, "rm");
        assert_eq!(c.assignments, vec!["FOO=bar", "BAZ='q x'"]);
        assert_eq!(c.full, "rm -rf x");
        // Quoted name is not an assignment: it is the program.
        let p = ok(r#""FOO"=bar ls"#);
        assert_eq!(p.commands.unwrap()[0].program, "FOO=bar");
        // After the program, NAME=value is an argument.
        let p = ok("make CC=gcc");
        let c = &p.commands.unwrap()[0];
        assert_eq!(c.program, "make");
        assert_eq!(c.args, vec!["CC=gcc"]);
        assert!(c.assignments.is_empty());
    }

    #[test]
    fn heredocs() {
        // The body is read after the command line, so its commands come after.
        assert_eq!(programs("cat <<EOF\nhello $(rm -rf x)\nEOF"), vec!["cat", "rm"]);
        // Quoted delimiter: body is literal.
        assert_eq!(programs("cat <<'EOF'\nhello $(rm -rf x)\nEOF"), vec!["cat"]);
        assert_eq!(programs("cat <<\"EOF\"\n`rm x`\nEOF"), vec!["cat"]);
        // Body lines that look like commands are not commands.
        assert_eq!(programs("cat <<'EOF'\nrm -rf x; curl y\nEOF"), vec!["cat"]);
        assert!(ops("cat <<'EOF'\na; b\nEOF").is_empty());
        // <<- strips leading tabs from the delimiter line.
        assert_eq!(programs("cat <<-EOF\n\thi\n\tEOF\nls"), vec!["cat", "ls"]);
        // Commands after the heredoc are seen.
        assert_eq!(programs("cat <<EOF > f\nbody\nEOF\nrm x"), vec!["cat", "rm"]);
        // Two heredocs on one line.
        assert_eq!(programs("cat <<A <<B\na\nA\nb\nB\nrm x"), vec!["cat", "rm"]);
        // A heredoc inside $( ).
        assert_eq!(programs("x=$(cat <<EOF\nhi\nEOF\n)"), vec!["cat", ""]);
        // Here-strings.
        assert_eq!(programs("grep a <<< \"$(rm x)\""), vec!["rm", "grep"]);
        // Unterminated heredoc fails.
        fails("cat <<EOF\nhello");
        fails("cat <<EOF");
    }

    #[test]
    fn eval_arguments_are_parsed() {
        assert_eq!(programs(r#"eval "rm -rf x""#), vec!["rm", "eval"]);
        assert_eq!(programs("eval 'ls; rm x'"), vec!["ls", "rm", "eval"]);
        assert_eq!(programs(r#"eval "for i in 1; do rm x; done""#), vec!["rm", "eval"]);
    }

    #[test]
    fn interpreter_strings_keep_interpreter_as_program() {
        // `bash -c` / `sh -c` are denied by program name in the hook; the
        // string stays a single argument.
        let p = ok(r#"bash -c "rm -rf x""#);
        let c = &p.commands.unwrap()[0];
        assert_eq!(c.program, "bash");
        assert_eq!(c.args, vec!["-c", "rm -rf x"]);
        assert_eq!(programs("sh -c 'ls'"), vec!["sh"]);
    }

    #[test]
    fn comments() {
        assert_eq!(programs("ls # ; rm -rf x"), vec!["ls"]);
        assert_eq!(programs("ls # comment\nrm x"), vec!["ls", "rm"]);
        assert_eq!(programs("echo a#b"), vec!["echo"]);
        assert_eq!(ok("echo a#b").commands.unwrap()[0].args, vec!["a#b"]);
        assert_eq!(programs("ls;#c"), vec!["ls"]);
    }

    #[test]
    fn line_continuation() {
        let p = ok("ls \\\n -la");
        let c = &p.commands.unwrap()[0];
        assert_eq!(c.program, "ls");
        assert_eq!(c.args, vec!["-la"]);
        assert_eq!(programs("r\\\nm x"), vec!["rm"]);
    }

    #[test]
    fn path_prefixed_program_is_kept() {
        assert_eq!(programs("/bin/rm -rf x"), vec!["/bin/rm"]);
        assert_eq!(programs("./ls"), vec!["./ls"]);
    }

    #[test]
    fn unsupported_syntax_fails() {
        fails("f() { rm x; }");
        fails("function f { rm x; }");
        fails("[[ -f x ]]");
        fails("time ls");
        fails("echo $((1 + 2))");
        fails("((x = 1))");
        fails("echo $'\\x72m'");
        fails("echo $\"hi\"");
        fails("echo ${X:-$(rm x)}");
        fails("echo ${X:-`rm x`}");
        fails("a=(1 2)");
        fails("coproc ls");
    }

    #[test]
    fn compound_commands_list_every_command_inside() {
        assert_eq!(programs("for i in 1 2; do rm $i; done"), vec!["rm"]);
        assert_eq!(programs("if test -f x; then cat x; elif true; then ls; else echo no; fi"), vec!["test", "cat", "true", "ls", "echo"]);
        assert_eq!(programs("while read l; do echo $l; done < f"), vec!["read", "echo"]);
        assert_eq!(programs("until false; do ls; done"), vec!["false", "ls"]);
        assert_eq!(programs("case $x in a|b) rm x;; (c) ls;& *) echo;; esac"), vec!["rm", "ls", "echo"]);
        assert_eq!(programs("{ rm x; ls; } > out"), vec!["rm", "ls"]);
        assert_eq!(programs("! ls | grep a"), vec!["ls", "grep"]);
        assert_eq!(programs("for f in *\ndo\n  cat \"$f\"\ndone"), vec!["cat"]);
        // Redirections after a compound command apply to everything in it.
        let p = ok("for f in a; do echo $f; done > out.txt");
        assert_eq!(p.commands.unwrap()[0].redirections[0].target, "out.txt");
        let p = ok("(echo hi) 2>/dev/null");
        assert_eq!(p.commands.unwrap()[0].redirections[0].target, "/dev/null");
        // Commands piped into a compound command read the pipe.
        let p = ok("ls | while read f; do cat $f; done");
        let c = p.commands.unwrap();
        assert!(!c[0].stdin_piped && c[1].stdin_piped && c[2].stdin_piped);
        for bad in ["for i in 1; do ls", "if true; then ls", "case x in a) ls", "{ ls", "for ((i=0;i<2;i++)); do ls; done", "for 'x' in a; do ls; done", "done", "fi", "then ls"] {
            fails(bad);
        }
    }

    #[test]
    fn variables_resolve_to_what_the_command_sets() {
        let none = |_: &str| None;
        let values = |cmd: &str, n: usize| {
            let p = ok(cmd);
            let c = p.commands.as_ref().unwrap()[n].clone();
            p.values(&c.scope, &c.arg_parts[0], &none)
        };
        assert_eq!(values("for f in a.txt 'b c'; do cat \"$f\"; done", 0), Ok(vec!["a.txt".into(), "b c".into()]));
        assert_eq!(values("for d in x y; do for f in \"$d\"/*; do cat $f; done; done", 0), Ok(vec!["x/*".into(), "y/*".into()]));
        assert_eq!(values("D=out; ls \"$D/a\"", 1), Ok(vec!["out/a".into()]));
        assert_eq!(values("D=out; E=${D}/x; ls $E", 2), Ok(vec!["out/x".into()]));
        assert_eq!(values("find . -name '*.txt' | sort | while read -r f; do cat \"$f\"; done", 3), Ok(vec!["./*.txt".into()]));
        // Not followed: the environment, a branch, a substitution, after a loop, `read` elsewhere.
        assert_eq!(values("cat $HOME", 0), Err(Unresolved::Var("HOME".into())));
        assert_eq!(values("if true; then D=/etc; fi; cat $D", 2), Err(Unresolved::Computed));
        assert_eq!(values("D=$(pwd); cat $D", 2), Err(Unresolved::Computed));
        assert_eq!(values("for f in a; do :; done; cat $f", 1), Err(Unresolved::Computed));
        assert_eq!(values("D=a; for i in 1; do D=/etc; done; cat $D", 2), Err(Unresolved::Computed));
        assert_eq!(values("read D; cat $D", 1), Err(Unresolved::Computed));
        // A piped assignment runs in a subshell: `$D` is the environment's.
        assert_eq!(values("D=a | cat; ls $D", 2), Err(Unresolved::Var("D".into())));
        assert_eq!(values("D=a & ls $D", 1), Err(Unresolved::Computed));
        assert_eq!(values("cat $1", 0), Err(Unresolved::Var("$".into())));
        assert_eq!(values("cat '$HOME'", 0), Ok(vec!["$HOME".into()]));
        assert_eq!(values("find . | while read f; do cat $f; done", 2), Err(Unresolved::Computed));
        assert_eq!(values("find . -name x -exec ls {} + | while read f; do cat $f; done", 2), Err(Unresolved::Computed));
        assert_eq!(values("find . ! -name '*.txt' | while read f; do cat $f; done", 2), Err(Unresolved::Computed));
        assert_eq!(values("find . -name '*.txt' -o -name '.env' | while read f; do cat $f; done", 2), Err(Unresolved::Computed));
        assert_eq!(values("find . -type f -name '*.md' -maxdepth 2 | while read f; do cat $f; done", 2), Ok(vec!["./*.md".into()]));
        assert_eq!(values("ls | while read f; do cat $f; done", 2), Err(Unresolved::Computed));
        assert!(ok("export VIBEWORK_SCRATCH=x").bound_names.contains("VIBEWORK_SCRATCH"));
        assert!(ok("source x.sh; ls").opaque);
        let p = ok("python3 - <<'PY'\nprint(1)\nPY");
        let c = &p.commands.as_ref().unwrap()[0];
        assert_eq!(p.heredoc_body(&c.redirections[0]), Some("print(1)\n"));
    }

    #[test]
    fn malformed_input_fails() {
        fails("echo 'unterminated");
        fails("echo \"unterminated");
        fails("echo $(ls");
        fails("echo `ls");
        fails("ls &&");
        fails("ls ||");
        fails("ls |");
        fails("&& ls");
        fails("; ls");
        fails("ls ;; ls");
        fails("ls >");
        fails("ls > # x");
        fails("echo \\");
        fails("");
        fails("   ");
    }

    #[test]
    fn deep_nesting_fails_instead_of_overflowing() {
        let mut cmd = String::from("ls");
        for _ in 0..40 {
            cmd = format!("echo $({})", cmd);
        }
        fails(&cmd);
    }

    #[test]
    fn writes_file_classification() {
        let r = |op: &str, target: &str| RedirectionInfo {
            fd: None,
            op: op.into(),
            target: target.into(),
            parts: vec![Part::Lit(target.into())],
            heredoc: None,
        };
        assert!(r(">", "f").writes_file());
        assert!(r(">>", "f").writes_file());
        assert!(r(">|", "f").writes_file());
        assert!(r("&>", "f").writes_file());
        assert!(r("&>>", "f").writes_file());
        assert!(r("<>", "f").writes_file());
        assert!(r(">&", "f").writes_file());
        assert!(!r(">", "/dev/null").writes_file());
        assert!(!r("&>", "/dev/null").writes_file());
        assert!(!r(">&", "2").writes_file());
        assert!(!r(">&", "-").writes_file());
        assert!(!r("<", "f").writes_file());
        assert!(!r("<&", "0").writes_file());
        assert!(!r("<<", "EOF").writes_file());
        assert!(!r("<<<", "x").writes_file());
    }
}
