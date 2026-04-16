import { CheckIcon, CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { TooltipIconButton } from "@/components/thread/tooltip-icon-button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export interface HumanMessageProps {
  content: string;
}

export function HumanMessage({ content }: HumanMessageProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="group ml-auto flex items-center gap-2"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.3,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
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
      <p className="bg-muted ml-2 max-w-[75%] w-fit rounded-xl px-5 py-2.5 whitespace-pre-wrap">
        {content}
      </p>
    </motion.div>
  );
}
