export interface PromptOption {
  id: string;
  label: string;
  nextStepId?: string;
  prompt?: string;
}

export interface PromptStep {
  id: string;
  question: string;
  prompt: string;
  options: PromptOption[];
}

export interface PromptFlow {
  id: string;
  label: string;
  icon: 'file' | 'chart' | 'calendar' | 'folder' | 'document' | 'prototype';
  steps: PromptStep[];
}

export const promptFlows: PromptFlow[] = [
  {
    id: 'create-file',
    label: 'Create a file',
    icon: 'file',
    steps: [
      {
        id: 'file-type',
        question: 'What kind of document?',
        prompt: 'Create a document about [topic].',
        options: [
          { id: 'word', label: 'Word Document', nextStepId: 'word-templates' },
          { id: 'spreadsheet', label: 'Spreadsheet', nextStepId: 'spreadsheet-templates' },
          { id: 'powerpoint', label: 'Powerpoint', nextStepId: 'powerpoint-templates' },
        ]
      },
      {
        id: 'word-templates',
        question: 'What type of document?',
        prompt: 'Create a Word document about [topic].',
        options: [
          {
            id: 'prd',
            label: 'PRD',
            prompt: `Help me write a PRD for [feature/product].

Before starting, ask me:
- What problem does this solve and who experiences it most acutely?
- What does success look like? (metrics, user outcomes)
- What's the scope—MVP vs full vision?
- Are there technical constraints or dependencies I should know about?
- Who are the stakeholders and what do they each care about?
- What's the timeline pressure?

Structure it so engineers can start working from it: problem statement, goals with success metrics, user stories, requirements (must-have vs nice-to-have), technical considerations, scope boundaries, and open questions. Output as .docx.`
          },
          {
            id: 'research',
            label: 'Research report',
            prompt: `Help me write a research report on [topic] from my notes and source documents.

Before starting, ask me:
- Which files in my working folder should this draw on (notes, data, prior reports)?
- What decision or action should this research inform?
- Who will read this and what's their existing knowledge level?
- How deep should this go—executive scan (2-3 pages) or comprehensive deep-dive?
- Are there specific angles I want covered?
- What's the deadline and how polished does it need to be?
- Any hypotheses I want validated or challenged?

Structure with: executive summary (findings + recommendation upfront), methodology, key findings with confidence levels, supporting evidence, implications, and recommended next steps. Be explicit about what we know vs. what we're inferring. Output as .docx.`
          },
          {
            id: 'article',
            label: 'Article or blog post',
            prompt: `Help me write an article about [topic].

Before starting, ask me:
- What's the one thing readers should remember or do after reading?
- Who's the target audience and where will this be published?
- What tone—thought leadership, tutorial, opinion piece, storytelling?
- Target length (500 words vs 2000 words changes everything)?
- Are there specific examples, data, or stories I want included?
- Any SEO keywords or topics I need to hit?

Output as .md file.`
          },
          {
            id: 'executive-summary',
            label: 'Executive summary',
            prompt: `Help me write an executive summary of [document/topic].

Before starting, ask me:
- What decision should this summary drive? (approval, funding, alignment, FYI)
- Who's the audience and what do they already know about this?
- What's the single most important takeaway?
- How much time will readers spend on this—30 seconds or 5 minutes?
- Are there sensitivities or politics I should navigate carefully?

Keep it to one page max. Lead with the recommendation/ask, then supporting rationale. Format for skimming—clear headers, bold key numbers, no fluff. Output as .docx.`
          },
          {
            id: 'legal-review',
            label: 'Legal review',
            prompt: `Help me review this contract: [file].

Before starting, ask me:
- What type of agreement is this (NDA, SaaS, employment, partnership)?
- Which side am I on—am I the one proposing this or receiving it?
- What's my risk tolerance (protect at all costs vs. get the deal done)?
- Are there specific clauses or concerns I'm already worried about?
- What's the business context—how important is this relationship?
- Do I have leverage to negotiate or is this mostly take-it-or-leave-it?

Create a risk matrix: clause, issue, severity (high/medium/low), recommendation, and suggested revision language. Flag anything unusual for this type of contract. Output as .docx.`
          },
          {
            id: 'release-notes',
            label: 'Release notes',
            prompt: `Help me write release notes for [feature/release].

Before starting, ask me:
- Who's the audience—internal team, customers, or both (need separate versions)?
- What's the most exciting thing in this release?
- Are there breaking changes, deprecations, or migration steps?
- What's the version number and release date?
- Any known issues or limitations to disclose?
- Should this include screenshots or GIFs?

Lead with what users can now do (benefits, not features). Group by: New, Improved, Fixed, Known Issues. Keep it scannable. Output as .docx.`
          },
          {
            id: 'email',
            label: 'Professional email',
            prompt: `Help me write an email about [topic/purpose].

Before starting, ask me:
- Who's receiving this and what's my relationship with them?
- What do I want them to do after reading? (reply, approve, just FYI)
- What's the context—are they expecting this or is it cold outreach?
- What tone—formal, friendly, urgent?
- Is there a deadline or time sensitivity?
- Any attachments or context they'll need?

Keep it concise—get to the point in the first two sentences. Clear subject line. Explicit ask at the end. Output as .docx.`
          },
          {
            id: 'sop',
            label: 'SOP / Process doc',
            prompt: `Help me write a standard operating procedure for [process].

Before starting, ask me:
- Who will follow this process and what's their skill level?
- What triggers this process to start? What signals it's complete?
- What are the most common mistakes or failure points?
- Are there approval steps or handoffs between people/teams?
- What tools or systems are involved?
- How often does this process run?

Include: purpose, scope, roles & responsibilities, step-by-step instructions with screenshots where helpful, decision trees for edge cases, and troubleshooting section. Output as .docx.`
          },
        ]
      },
      {
        id: 'spreadsheet-templates',
        question: 'What type of spreadsheet?',
        prompt: 'Create a spreadsheet for [purpose].',
        options: [
          {
            id: 'budget',
            label: 'Budget tracker',
            prompt: `Help me create a budget tracking spreadsheet for [purpose].

Before starting, ask me:
- Is this personal, project, or departmental budget?
- What's the time period—monthly, quarterly, annual?
- What are the main expense categories I need to track?
- Do I need to track actuals vs. planned (variance analysis)?
- Are there multiple funding sources or cost centers?
- Do I need approval workflows or just tracking?

Include: income/revenue section, categorized expenses, monthly/quarterly views, summary dashboard with key metrics (burn rate, runway, variance), and charts. Add conditional formatting for over-budget items. Output as .xlsx.`
          },
          {
            id: 'project-plan',
            label: 'Project plan',
            prompt: `Help me create a project plan spreadsheet for [project].

Before starting, ask me:
- What's the project timeline (start date, target end date)?
- How many people/teams are involved?
- What are the major milestones or phases?
- Do I need to track dependencies between tasks?
- What level of granularity—weekly tasks or daily?
- Do I need resource allocation / capacity tracking?

Include: task list with owners, start/end dates, status tracking (not started/in progress/blocked/done), dependencies, milestone flags, Gantt-style timeline view, and summary dashboard showing % complete and at-risk items. Output as .xlsx.`
          },
          {
            id: 'data-analysis',
            label: 'Data analysis',
            prompt: `Help me create a data analysis spreadsheet for [dataset/purpose].

Before starting, ask me:
- What question am I trying to answer with this data?
- What format is the raw data in (CSV, copy-paste, API)?
- What are the key dimensions I want to slice by?
- What metrics matter most?
- Who's the audience for the analysis?
- Do I need this to auto-update or is it a one-time analysis?

Include: raw data tab (properly formatted), cleaned/transformed data tab, analysis tab with pivot tables, summary statistics, and visualization tab with charts. Add documentation for methodology. Output as .xlsx.`
          },
          {
            id: 'inventory',
            label: 'Inventory tracker',
            prompt: `Help me create an inventory tracking spreadsheet for [items/business].

Before starting, ask me:
- What am I tracking (products, equipment, supplies)?
- How many SKUs/items approximately?
- Do I need to track multiple locations or warehouses?
- What's my reorder process—manual or should this generate alerts?
- Do I need to track costs (COGS, inventory value)?
- Are there expiration dates or lot numbers to track?

Include: item master list, current stock levels, reorder points with alerts (conditional formatting), transaction log (in/out), supplier info, valuation summary, and low-stock dashboard. Output as .xlsx.`
          },
          {
            id: 'crm-tracker',
            label: 'CRM / Sales tracker',
            prompt: `Help me create a CRM/sales tracking spreadsheet for [business/purpose].

Before starting, ask me:
- What's my sales process (stages from lead to close)?
- What info do I need to capture per contact/deal?
- Do I need to track activities (calls, emails, meetings)?
- What's my typical sales cycle length?
- Do I need pipeline value forecasting?
- Multiple salespeople or just me?

Include: contacts/companies sheet, deals pipeline with stages, activity log, pipeline dashboard with value by stage, conversion metrics, and follow-up reminders. Output as .xlsx.`
          },
          {
            id: 'okr-tracker',
            label: 'OKR / Goal tracker',
            prompt: `Help me create an OKR tracking spreadsheet for [team/company].

Before starting, ask me:
- What time period (quarterly, annual)?
- How many levels (company → team → individual)?
- How do I want to score key results (0-1, percentage, binary)?
- Do I need to track progress updates over time?
- How many objectives and key results approximately?
- Do I need alignment mapping (how team OKRs ladder up)?

Include: objectives with owners, key results with targets and current values, scoring calculations, progress visualization, alignment view, and summary dashboard. Add weekly/monthly check-in log. Output as .xlsx.`
          },
        ]
      },
      {
        id: 'powerpoint-templates',
        question: 'What type of presentation?',
        prompt: 'Create a presentation about [topic].',
        options: [
          {
            id: 'pitch-deck',
            label: 'Pitch deck',
            prompt: `Help me create a pitch deck for [company/product].

Before starting, ask me:
- What stage is this for (pre-seed, seed, Series A)?
- Who's the audience (angels, VCs, strategic investors)?
- What's my ask (amount raising, use of funds)?
- What's my strongest proof point (traction, team, tech, market)?
- How long do I have to present (5 min, 15 min, leave-behind)?
- What's my biggest weakness I need to address?

Structure: Hook/problem (1 slide), Solution (1-2), Market size (1), Product/demo (2-3), Traction/validation (1-2), Business model (1), Competition/moat (1), Team (1), Financials/roadmap (1), Ask (1). Keep text minimal—this is a visual aid, not a document. Output as .pptx.`
          },
          {
            id: 'quarterly-review',
            label: 'Quarterly review',
            prompt: `Help me create a quarterly review presentation for [team/department].

Before starting, ask me:
- Who's the audience (leadership, board, team, all-hands)?
- What were the goals/OKRs for this quarter?
- What's the headline—good quarter, rough quarter, mixed?
- What metrics does leadership care most about?
- Are there asks or decisions needed from this meeting?
- How much time do I have?

Structure: Executive summary (1 slide with the headline), Goals vs actuals scorecard, Key wins with evidence, Misses with honest analysis and learnings, Key metrics deep-dive, Challenges and risks, Next quarter priorities, Asks/discussion items. Include appendix for detailed data. Output as .pptx.`
          },
          {
            id: 'training',
            label: 'Training material',
            prompt: `Help me create training presentation for [topic].

Before starting, ask me:
- Who's the audience and what do they already know?
- What should they be able to DO after this training?
- Is this self-paced or instructor-led?
- How long is the training session?
- Are there hands-on exercises or just information transfer?
- Do I need assessment/quiz questions?

Structure: Learning objectives upfront, Concept introduction with real examples, Step-by-step demonstrations, Practice exercises, Common mistakes/troubleshooting, Quick reference summary, Knowledge check questions. Keep slides simple—one concept per slide. Include speaker notes. Output as .pptx.`
          },
          {
            id: 'project-update',
            label: 'Project update',
            prompt: `Help me create a project update presentation for [project].

Before starting, ask me:
- What's the overall project status (green/yellow/red)?
- Who's the audience and what do they care about?
- What's the most important thing they need to know?
- Are there blockers that need escalation or decisions?
- How does current progress compare to the original plan?
- What's the time slot (5 min check-in vs 30 min deep-dive)?

Structure: Status summary with RAG (1 slide), Progress since last update, Milestone tracker, Current blockers and risks, Decisions needed, Next steps with owners and dates. Keep it action-oriented—what do you need from the audience? Output as .pptx.`
          },
          {
            id: 'strategy-deck',
            label: 'Strategy presentation',
            prompt: `Help me create a strategy presentation for [initiative/area].

Before starting, ask me:
- What's the strategic question or decision this addresses?
- Who's the audience and what's their context?
- What's the current state vs desired future state?
- What options am I presenting (or is this a recommendation)?
- What data or analysis supports this strategy?
- What's the ask—approval, feedback, alignment?

Structure: Context and why now, Current state assessment, Vision/desired outcome, Strategic options with pros/cons (or recommended approach), Roadmap and key initiatives, Resource requirements, Risks and mitigations, Success metrics, Decision/ask. Output as .pptx.`
          },
          {
            id: 'all-hands',
            label: 'All-hands / Town hall',
            prompt: `Help me create an all-hands presentation for [company/team].

Before starting, ask me:
- What's the main message or theme?
- What's the company/team mood right now?
- What updates are essential to cover?
- Are there any difficult topics to address?
- How long is the meeting?
- Will there be Q&A?

Structure: Opening hook/theme, Key wins and shoutouts, Business updates and metrics, Important announcements, What's ahead, Cultural moment or values highlight, Q&A framing. Keep energy high and text minimal. Include speaker notes for sensitive topics. Output as .pptx.`
          },
        ]
      },
    ]
  },
  {
    id: 'crunch-data',
    label: 'Crunch data',
    icon: 'chart',
    steps: [
      {
        id: 'data-task',
        question: 'What do you need to do?',
        prompt: 'Help me work with this data: [file/description].',
        options: [
          {
            id: 'analyze',
            label: 'Analyze dataset',
            prompt: `Help me analyze this dataset: [file/description].

Before starting, ask me:
- What question am I trying to answer?
- What would a useful insight look like—what decision would it inform?
- Are there specific metrics or dimensions I care about?
- What do I already suspect might be true?
- Who's the audience for this analysis?
- What format should the output be (report, dashboard, raw findings)?

Identify patterns, outliers, correlations, and trends. Provide summary statistics, segment analysis, and visualizations. Flag anything surprising. Be explicit about confidence levels and sample sizes.`
          },
          {
            id: 'clean',
            label: 'Clean & transform',
            prompt: `Help me clean and transform this data: [file/description].

Before starting, ask me:
- What's wrong with it currently (missing values, duplicates, format issues)?
- What should the final schema look like?
- How should I handle missing data (drop, impute, flag)?
- Are there business rules for valid values?
- Does this need to match or join with other datasets?
- What format do I need the output in?

Document all transformations applied. Flag records that couldn't be cleaned. Provide before/after summary statistics.`
          },
          {
            id: 'visualize',
            label: 'Create visualizations',
            prompt: `Help me create visualizations for this data: [file/description].

Before starting, ask me:
- What story should these visualizations tell?
- Who's the audience (technical, executive, public)?
- Where will these be used (presentation, dashboard, report)?
- What comparisons matter most?
- Do I need interactive or static visuals?
- Any brand/style guidelines to follow?

Create clear, honest visualizations. Include titles, labels, and annotations. Avoid chart junk. Explain why each chart type was chosen.`
          },
          {
            id: 'forecast',
            label: 'Build forecast',
            prompt: `Help me build a forecast based on this data: [file/description].

Before starting, ask me:
- What am I forecasting and at what granularity (daily, monthly)?
- How far out do I need to forecast?
- What drives this metric—are there known factors or seasonality?
- How accurate does this need to be?
- What decisions will this forecast inform?
- Do I have external data that might help (market data, events)?

Provide point forecasts with confidence intervals. Explain methodology and assumptions. Flag risks to forecast accuracy. Include scenario analysis (optimistic, base, pessimistic) if relevant.`
          },
          {
            id: 'compare',
            label: 'Compare datasets',
            prompt: `Help me compare these datasets: [files/description].

Before starting, ask me:
- What's the hypothesis—what difference do I expect to find?
- What's the common key to join/compare on?
- Are these time periods, cohorts, segments, or something else?
- What metrics should I compare?
- Do I need statistical significance testing?
- What format should the comparison output be?

Provide side-by-side comparisons, delta calculations, statistical tests where appropriate, and visualizations of differences. Flag anomalies.`
          },
          {
            id: 'automate',
            label: 'Automate reporting',
            prompt: `Help me automate reporting for this data: [file/description].

Before starting, ask me:
- What report do I need generated and how often?
- Where does the source data live?
- Who receives the report and in what format?
- What metrics and dimensions should it include?
- Are there thresholds or alerts I need (e.g., notify if X drops below Y)?
- What tools am I using (Excel, Google Sheets, BI tool)?

Create automated workflow with scheduled data pulls, calculations, formatting, and distribution. Include error handling and data validation checks.`
          },
        ]
      },
    ]
  },
  {
    id: 'prep-meeting',
    label: 'Prep for a meeting',
    icon: 'calendar',
    steps: [
      {
        id: 'meeting-type',
        question: 'What kind of meeting?',
        prompt: 'Help me prepare for a meeting about [topic].',
        options: [
          {
            id: 'one-on-one',
            label: '1:1 meeting',
            prompt: `Help me prepare for a 1:1 meeting with [person/role].

Before starting, ask me:
- What's my relationship with this person (report, manager, peer, skip-level)?
- Is this a regular 1:1 or a special conversation?
- What's top of mind for me going into this?
- Is there anything difficult I need to address?
- What do I want from them? What might they want from me?
- How much time do we have?

Create: talking points ordered by priority, questions to ask, topics I should bring up proactively, any feedback to deliver, and follow-up items from previous meetings (if I share context). Include conversation starters for difficult topics.`
          },
          {
            id: 'team-standup',
            label: 'Team standup',
            prompt: `Help me prepare for a team standup.

Before starting, ask me:
- What projects am I currently working on?
- What did I accomplish since last standup?
- Am I blocked on anything or need input from others?
- Are there any risks or timeline changes to flag?
- Anything I need to coordinate with teammates on?

Create concise update: yesterday's accomplishments (with outcomes, not just activities), today's priorities, blockers needing help, and any FYIs for the team. Keep it under 2 minutes speaking time.`
          },
          {
            id: 'client-call',
            label: 'Client call',
            prompt: `Help me prepare for a client call with [client name].

Before starting, ask me:
- What's the purpose of this call?
- What's the current state of the relationship (new, healthy, at-risk)?
- What do I need from them? What might they need from me?
- Are there any open issues or concerns to address?
- What's our history—key context from past interactions?
- Who else will be on the call?

Create: agenda to share in advance, key talking points, anticipated questions and my answers, discovery questions to ask, red flags to watch for, and clear next steps to propose.`
          },
          {
            id: 'presentation',
            label: 'Presentation',
            prompt: `Help me prepare for presenting [topic] to [audience].

Before starting, ask me:
- What's the goal—inform, persuade, get approval, train?
- How much time do I have?
- What does the audience already know about this topic?
- What objections or tough questions should I expect?
- Is there a decision-maker I need to convince?
- What's my key message in one sentence?

Create: presentation outline, opening hook, key messages with supporting points, anticipated Q&A with answers, and closing/call-to-action. Include practice tips and timing guidance.`
          },
          {
            id: 'negotiation',
            label: 'Negotiation',
            prompt: `Help me prepare for a negotiation about [topic].

Before starting, ask me:
- What am I negotiating (deal terms, salary, contract, partnership)?
- What's my ideal outcome? What's my walk-away point?
- What do I know about the other party's interests and constraints?
- What leverage do I have? What leverage do they have?
- What's my BATNA (best alternative if this doesn't work)?
- Is this a one-time deal or an ongoing relationship?

Create: negotiation strategy, opening position, concessions I can make (and their value), questions to understand their interests, responses to likely pushback, and red lines I won't cross.`
          },
          {
            id: 'interview',
            label: 'Job interview',
            prompt: `Help me prepare for an interview for [role] at [company].

Before starting, ask me:
- What stage is this (phone screen, technical, onsite, final)?
- What do I know about the interviewer(s)?
- What are the key requirements from the job description?
- What's my relevant experience and strongest selling points?
- Are there any gaps or concerns I need to address?
- What questions do I want answered?

Using the job description and what I tell you about the company, create: STAR stories for likely behavioral questions, answers to common questions for this role type, questions to ask them, and any prep materials to review.`
          },
          {
            id: 'board-meeting',
            label: 'Board meeting',
            prompt: `Help me prepare for a board meeting about [topics].

Before starting, ask me:
- What's on the agenda?
- What decisions need board approval?
- What's the overall company/project status (good news or tough news)?
- Are there any contentious items or likely pushback?
- What information have I already sent in advance?
- Who's on the board and what do they each care about?

Create: executive summary of each agenda item, key metrics with context, talking points for difficult topics, anticipated questions with answers, and specific asks with clear recommendations.`
          },
        ]
      },
    ]
  },
  {
    id: 'organize-folders',
    label: 'Organise folders',
    icon: 'folder',
    steps: [
      {
        id: 'organize-task',
        question: 'What do you want to organize?',
        prompt: 'Help me organize my files and folders.',
        options: [
          {
            id: 'desktop',
            label: 'Desktop cleanup',
            prompt: `Help me organize my desktop.

Before starting, ask me:
- What types of files typically end up on my desktop?
- Do I have existing folder structures I use elsewhere?
- What do I need quick access to (keep on desktop)?
- Should I archive old files or delete them?
- Do I want dated folders or category-based organization?
- Any naming conventions I already use?

Scan desktop, categorize files, create logical folder structure, move files appropriately. Identify duplicates and large files. Create an "Inbox" or "To Sort" folder for ambiguous items. Provide summary of what was organized and any files needing my decision.`
          },
          {
            id: 'project-files',
            label: 'Project files',
            prompt: `Help me organize files for [project].

Before starting, ask me:
- What's the project about and how long will it run?
- What types of files are involved (docs, code, designs, data)?
- How many people work on this—do I need shared conventions?
- Are there phases or milestones that should structure folders?
- Do I need version control or is "final_v2_FINAL" okay?
- Any compliance requirements (naming, retention)?

Create: logical folder hierarchy, naming conventions, README explaining structure, and any templates needed. Move existing files into structure. Flag duplicates and outdated files.`
          },
          {
            id: 'downloads',
            label: 'Downloads folder',
            prompt: `Help me clean up my Downloads folder.

Before starting, ask me:
- How far back should I look at files?
- What should definitely be kept vs. definitely deleted?
- Do I have other folders to sort these into?
- Should I create an archive folder for "maybe need later"?
- Are there file types I download repeatedly that need a home?

Sort by type and date. Identify: duplicates, temporary files (installers, zip files), large files, and items that belong elsewhere. Create organized subfolders or move to appropriate locations. Delete obvious junk with my approval. Provide summary of actions taken.`
          },
          {
            id: 'photos',
            label: 'Photos & media',
            prompt: `Help me organize my photos and media files.

Before starting, ask me:
- How should photos be organized—by date, event, person, location?
- What date range am I organizing?
- Are there albums or collections I want to maintain?
- Should I identify and remove duplicates?
- Do I need to separate raw files from edited versions?
- Any photos that should be backed up vs. deleted?

Create folder structure based on preference. Rename files consistently. Identify duplicates, screenshots, and low-quality images. Separate photos from videos. Provide summary and any files needing my decision.`
          },
          {
            id: 'email-attachments',
            label: 'Email attachments',
            prompt: `Help me organize saved email attachments.

Before starting, ask me:
- Where are attachments currently saved?
- How do I want them organized (by sender, project, date, type)?
- Are there attachments I can delete after saving locally?
- Any important files I'm specifically looking for?

Scan the attachment folder, categorize by sender/project/type based on file names and contents, and create a logical structure. Flag large files and potential duplicates.`
          },
        ]
      },
    ]
  },
  {
    id: 'existing-file',
    label: 'Work with existing file',
    icon: 'document',
    steps: [
      {
        id: 'file-action',
        question: 'What do you want to do?',
        prompt: 'Help me work with this file: [file].',
        options: [
          {
            id: 'summarize',
            label: 'Summarize',
            prompt: `Help me summarize this document: [file].

Before starting, ask me:
- How long should the summary be (one paragraph, one page, bullet points)?
- Who's the audience and what do they care about?
- Should I focus on any specific aspect?
- Do I need action items extracted?
- Is there anything I should definitely include or exclude?

Provide: executive summary, key points with section references, action items or decisions mentioned, and questions or gaps the document leaves open. Maintain original intent without editorializing.`
          },
          {
            id: 'edit',
            label: 'Edit & improve',
            prompt: `Help me edit and improve this document: [file].

Before starting, ask me:
- What's not working about it currently?
- Who's the audience and what tone should it have?
- What's the goal of this document?
- Should I focus on specific sections or the whole thing?
- Are there length constraints?
- Any examples of the style I'm going for?

Provide: edited version with track changes or clearly marked edits, explanation of major changes, and any structural suggestions. Preserve the author's voice while improving clarity and impact.`
          },
          {
            id: 'extract',
            label: 'Extract info',
            prompt: `Help me extract information from this file: [file].

Before starting, ask me:
- What specific information do I need extracted?
- What format should the output be (table, list, document)?
- Are there multiple records/items or one thing?
- Should I include context or just the raw data?
- Do I need this validated against any rules?

Extract requested information accurately. Flag any ambiguities or items I should verify. Provide in requested format with source references.`
          },
          {
            id: 'convert',
            label: 'Convert format',
            prompt: `Help me convert this file: [file] to [target format].

Before starting, ask me:
- What's the source format and target format?
- Should I preserve all formatting or simplify?
- Are there specific elements that must be maintained (tables, images, formulas)?
- What software will open the converted file?
- Any file size constraints?

Convert while preserving structure, formatting, and data integrity. Flag any elements that couldn't convert cleanly. Provide both converted file and summary of any changes or losses.`
          },
          {
            id: 'translate',
            label: 'Translate',
            prompt: `Help me translate this document: [file] to [language].

Before starting, ask me:
- What's the source language and target language?
- Who's the audience—native speakers, business context, casual?
- Should I localize (adapt idioms, formats) or translate literally?
- Are there technical terms that should stay in original language?
- Do I need the translation alongside the original or standalone?

Translate accurately while maintaining tone and intent. Flag any idioms or cultural references that don't translate directly. Provide options for ambiguous phrases.`
          },
          {
            id: 'compare-versions',
            label: 'Compare versions',
            prompt: `Help me compare these document versions: [files].

Before starting, ask me:
- Which version is the baseline and which is the comparison?
- What changes am I looking for (any, specific sections, substantive only)?
- Should I track formatting changes or just content?
- Do I need a summary or detailed line-by-line?
- What format should the comparison output be?

Provide: summary of changes, detailed diff with additions/deletions marked, and assessment of significance. Flag any conflicting changes if comparing multiple versions against baseline.`
          },
          {
            id: 'proofread',
            label: 'Proofread',
            prompt: `Help me proofread this document: [file].

Before starting, ask me:
- What kind of document is this (formal, casual, technical)?
- Any specific style guide (AP, Chicago, company standards)?
- Should I check grammar only, or also style and clarity?
- Are there terms or spellings specific to my context?
- What's the priority—quick review or thorough edit?

Check for: spelling, grammar, punctuation, consistency, and clarity issues. Provide corrections with explanations. Don't change author's voice or make stylistic changes unless asked.`
          },
        ]
      },
    ]
  },
  {
    id: 'prototype',
    label: 'Make a prototype',
    icon: 'prototype',
    steps: [
      {
        id: 'prototype-type',
        question: 'What kind of prototype?',
        prompt: 'Help me create a prototype for [purpose].',
        options: [
          {
            id: 'web-app',
            label: 'Web app',
            prompt: `Help me prototype a web app for [purpose].

Before starting, ask me:
- What's the core user flow I'm testing?
- Who's the user and what problem does this solve?
- What level of fidelity—wireframe, styled mockup, or working prototype?
- Are there specific features that must be included?
- Do I have design references or inspiration?
- Is this for user testing, stakeholder demo, or development handoff?

Create working prototype with HTML/CSS/JS. Focus on core functionality over polish. Include realistic sample data. Provide documentation for any interactive elements. Note what's real vs. mocked.`
          },
          {
            id: 'landing-page',
            label: 'Landing page',
            prompt: `Help me create a landing page prototype for [product/service].

Before starting, ask me:
- What's the primary conversion goal (sign up, buy, download)?
- Who's the target audience?
- What's the key value proposition?
- Do I have copy/content or should I draft it?
- Any brand guidelines (colors, fonts, tone)?
- Do I have images/assets or should I use placeholders?

Create: hero section with clear value prop, features/benefits section, social proof (testimonials, logos), call-to-action, and footer. Optimize for conversion. Mobile-responsive. Include all copy.`
          },
          {
            id: 'dashboard',
            label: 'Dashboard',
            prompt: `Help me prototype a dashboard for [purpose].

Before starting, ask me:
- What decisions should this dashboard inform?
- Who are the users and how often will they check it?
- What are the 3-5 most important metrics?
- Do I have sample data or should I generate realistic fake data?
- Are there any actions users should take from the dashboard?
- Do I need filtering, date ranges, or other controls?

Create interactive dashboard with key metrics, charts appropriate to the data, filtering/controls, and responsive layout. Use realistic data. Include loading states and empty states.`
          },
          {
            id: 'mobile-mockup',
            label: 'Mobile mockup',
            prompt: `Help me create a mobile app mockup for [purpose].

Before starting, ask me:
- iOS, Android, or cross-platform?
- What are the core screens and user flow?
- What's the primary action on each screen?
- Do I have design system references or starting from scratch?
- Is this for user testing or stakeholder presentation?
- Do I need to show navigation and transitions?

Create mobile-optimized mockups for key screens. Show realistic content. Include navigation patterns. Provide clickable prototype if needed for user testing. Note platform conventions followed.`
          },
          {
            id: 'email-template',
            label: 'Email template',
            prompt: `Help me create an email template for [purpose].

Before starting, ask me:
- What type of email (marketing, transactional, newsletter)?
- What email client(s) must it work in?
- What's the primary CTA?
- Do I have brand guidelines and assets?
- What's the approximate content structure?
- Do I need a plain-text version?

Create responsive HTML email template that works across clients. Include header, body sections, CTA buttons, and footer. Test-ready with sample content. Note any client-specific limitations.`
          },
          {
            id: 'form-flow',
            label: 'Form or wizard',
            prompt: `Help me create a form/wizard prototype for [purpose].

Before starting, ask me:
- What information am I collecting?
- Should this be one page or multi-step?
- What validations are needed?
- Are there conditional fields (show/hide based on answers)?
- What happens on successful submission?
- Do I need to save progress?

Create working form with proper input types, validation, error handling, progress indication (if multi-step), and submission confirmation. Include realistic field labels and help text.`
          },
          {
            id: 'chrome-extension',
            label: 'Chrome extension',
            prompt: `Help me prototype a Chrome extension for [purpose].

Before starting, ask me:
- What's the core functionality?
- What websites should it work on (all, specific sites)?
- What permissions will it need?
- Does it need a popup UI, sidebar, or just background functionality?
- Does it need to modify page content?
- Is this for personal use or distribution?

Create working extension with manifest, popup/content scripts as needed, and basic styling. Include installation instructions and note any limitations of the prototype.`
          },
        ]
      },
    ]
  },
];
