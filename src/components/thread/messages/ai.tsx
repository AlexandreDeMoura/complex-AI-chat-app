import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { MarkdownText } from "@/components/thread/markdown-text";
import { TooltipIconButton } from "@/components/thread/tooltip-icon-button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export interface AssistantMessageProps {
  content: string;
  onRegenerate?: () => void;
}

export function AssistantMessage({ content, onRegenerate }: AssistantMessageProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  return (
    <div className="group mr-auto flex w-full items-start gap-2">
      <div className="flex w-full flex-col gap-2">
        <div className="py-1">
          <MarkdownText>{content}</MarkdownText>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <TooltipIconButton
            tooltip="Copy"
            onClick={() => copyToClipboard(content)}
          >
            {isCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          </TooltipIconButton>
          {onRegenerate && (
            <TooltipIconButton tooltip="Regenerate" onClick={onRegenerate}>
              <RefreshCwIcon className="size-3.5" />
            </TooltipIconButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="mr-auto flex items-start gap-2">
      <div className="bg-muted flex h-8 items-center gap-1 rounded-2xl px-4 py-2">
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full" />
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_0.5s_infinite] rounded-full" />
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_1s_infinite] rounded-full" />
      </div>
    </div>
  );
}
