import {
  DecoratorNode,
  DOMConversionMap,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { ReactNode } from "react";
import { FileText, X } from "@/lib/icons";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

export type SerializedFileMentionNode = Spread<
  {
    filePath: string;
  },
  SerializedLexicalNode
>;

function FileMentionComponent({
  filePath,
  nodeKey,
}: {
  filePath: string;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const filename = filePath.split("/").pop() || filePath;

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    editor.update(() => {
      const node = $getFileMentionNode(nodeKey);
      if (node) {
        node.remove();
      }
    });
  };

  return (
    <span
      className="file-mention-pill select-none"
      title={filePath}
      contentEditable={false}
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[200px]">{filename}</span>
      <button
        onClick={handleRemove}
        className="ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100"
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function $getFileMentionNode(key: NodeKey): FileMentionNode | null {
  const node = $getNodeByKey(key);
  if ($isFileMentionNode(node)) {
    return node;
  }
  return null;
}

// Import this at the module level to use in $getFileMentionNode
import { $getNodeByKey } from "lexical";

export class FileMentionNode extends DecoratorNode<ReactNode> {
  __filePath: string;

  static getType(): string {
    return "file-mention";
  }

  static clone(node: FileMentionNode): FileMentionNode {
    return new FileMentionNode(node.__filePath, node.__key);
  }

  constructor(filePath: string, key?: NodeKey) {
    super(key);
    this.__filePath = filePath;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.setAttribute("data-lexical-file-mention", "true");
    element.setAttribute("data-file-path", this.__filePath);
    element.textContent = this.__filePath.split("/").pop() || this.__filePath;
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-file-mention")) {
          return null;
        }
        return {
          conversion: (element: HTMLElement) => {
            const filePath = element.getAttribute("data-file-path");
            if (filePath) {
              return { node: $createFileMentionNode(filePath) };
            }
            return null;
          },
          priority: 1,
        };
      },
    };
  }

  static importJSON(
    serializedNode: SerializedFileMentionNode
  ): FileMentionNode {
    return $createFileMentionNode(serializedNode.filePath);
  }

  exportJSON(): SerializedFileMentionNode {
    return {
      filePath: this.__filePath,
      type: "file-mention",
      version: 1,
    };
  }

  getFilePath(): string {
    return this.__filePath;
  }

  getTextContent(): string {
    // Return the path wrapped in tags for serialization
    return `<vibe-work-file>${this.__filePath}</vibe-work-file>`;
  }

  decorate(): ReactNode {
    return (
      <FileMentionComponent filePath={this.__filePath} nodeKey={this.__key} />
    );
  }

  isIsolated(): boolean {
    return true;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createFileMentionNode(filePath: string): FileMentionNode {
  return new FileMentionNode(filePath);
}

export function $isFileMentionNode(
  node: LexicalNode | null | undefined
): node is FileMentionNode {
  return node instanceof FileMentionNode;
}
