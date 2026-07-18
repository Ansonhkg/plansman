import ReactMarkdown, {type ExtraProps} from "react-markdown";
import remarkGfm from "remark-gfm";

const AGENT_MARKER = "[!AGENT]";

type MdastNode = {
  type?: string;
  value?: string;
  children?: MdastNode[];
  data?: {hProperties?: Record<string, unknown>};
};

function isAgentCallout(node: MdastNode): boolean {
  const paragraph = node.children?.[0];
  if (paragraph?.type !== "paragraph") return false;
  const text = paragraph.children?.[0];
  return text?.type === "text" && typeof text.value === "string" && text.value.startsWith(AGENT_MARKER);
}

function stripAgentMarker(node: MdastNode) {
  const paragraph = node.children![0];
  const text = paragraph.children![0];
  text.value = text.value!.slice(AGENT_MARKER.length).replace(/^\n/, "");
  if (text.value === "") paragraph.children!.shift();
  if (paragraph.children!.length === 0) node.children!.shift();
}

function remarkAgentCallout() {
  return (tree: MdastNode) => {
    const visit = (node: MdastNode) => {
      if (node.type === "blockquote" && isAgentCallout(node)) {
        stripAgentMarker(node);
        node.data = {...node.data, hProperties: {...node.data?.hProperties, dataCallout: "agent"}};
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

function Blockquote({node, ...props}: React.BlockquoteHTMLAttributes<HTMLQuoteElement> & ExtraProps) {
  const callout =
    (props as Record<string, unknown>)["data-callout"] ??
    (node?.properties as Record<string, unknown> | undefined)?.dataCallout ??
    (node?.properties as Record<string, unknown> | undefined)?.["data-callout"];

  if (callout !== "agent") return <blockquote {...props} />;

  const {children} = props;
  return (
    <details className="agent-callout">
      <summary>Agent protocol</summary>
      <div>{children}</div>
    </details>
  );
}

export function Markdown({children}: {children: string}) {
  return (
    <ReactMarkdown components={{blockquote: Blockquote}} remarkPlugins={[remarkGfm, remarkAgentCallout]}>
      {children}
    </ReactMarkdown>
  );
}
