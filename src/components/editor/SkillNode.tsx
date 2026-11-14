import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import type { ReactNode } from "react";

export type SerializedSkillNode = Spread<{ skillId: string }, SerializedLexicalNode>;

/** The chip a skill chosen from the "/" menu becomes, in the message box and in the sent message. */
export function SkillChip({ id, className }: { id: string; className?: string }) {
  return (
    <span className={className ? `skill-chip ${className}` : "skill-chip"} title={`Skill: ${id}`} data-skill-id={id}>
      /{id}
    </span>
  );
}

/**
 * A skill chosen in the message box: one unit (Backspace removes it whole;
 * see SkillCommandPlugin), shown as "/id", sent as a `<vibe-work-skill>` tag.
 */
export class SkillNode extends DecoratorNode<ReactNode> {
  __skillId: string;

  static getType(): string {
    return "skill-chip";
  }

  static clone(node: SkillNode): SkillNode {
    return new SkillNode(node.__skillId, node.__key);
  }

  constructor(skillId: string, key?: NodeKey) {
    super(key);
    this.__skillId = skillId;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  static importJSON(serialized: SerializedSkillNode): SkillNode {
    return $createSkillNode(serialized.skillId);
  }

  exportJSON(): SerializedSkillNode {
    return { skillId: this.__skillId, type: "skill-chip", version: 1 };
  }

  getSkillId(): string {
    return this.__skillId;
  }

  getTextContent(): string {
    return `/${this.__skillId}`;
  }

  decorate(): ReactNode {
    return (
      <span contentEditable={false} className="select-none">
        <SkillChip id={this.__skillId} />
      </span>
    );
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return false;
  }
}

export function $createSkillNode(skillId: string): SkillNode {
  return new SkillNode(skillId);
}

export function $isSkillNode(node: LexicalNode | null | undefined): node is SkillNode {
  return node instanceof SkillNode;
}

export function $getSkillNode(key: NodeKey): SkillNode | null {
  const node = $getNodeByKey(key);
  return $isSkillNode(node) ? node : null;
}
