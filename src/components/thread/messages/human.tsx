export interface HumanMessageProps {
  content: string
}

export function HumanMessage({ content }: HumanMessageProps) {
  return (
    <div className="group ml-auto flex items-center gap-2">
      <p className="bg-muted ml-auto w-fit rounded-3xl px-4 py-2 text-right whitespace-pre-wrap">
        {content}
      </p>
    </div>
  )
}
