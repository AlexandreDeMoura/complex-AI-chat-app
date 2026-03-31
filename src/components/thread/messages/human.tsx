import { CheckIcon, CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { TooltipIconButton } from "@/components/thread/tooltip-icon-button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export interface HumanMessageProps {
  content: string;
}

export function HumanMessage({ content }: HumanMessageProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  return (
    <div className="group ml-auto flex items-center gap-2">
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <TooltipIconButton
          tooltip="Copy"
          onClick={() => copyToClipboard(content)}
        >
          {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </TooltipIconButton>
        <TooltipIconButton tooltip="Edit" disabled>
          <PencilIcon className="size-3.5" />
        </TooltipIconButton>
        <TooltipIconButton tooltip="Delete" disabled>
          <Trash2Icon className="size-3.5" />
        </TooltipIconButton>
      </div>
      <p className="bg-muted ml-auto max-w-[75%] w-fit rounded-3xl px-4 py-2 text-right whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
