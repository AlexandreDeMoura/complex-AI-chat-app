import { useEffect, useRef, useState } from 'react'
import type { ModelOption } from '@/features/chat/model'

function useIsDark() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : true,
  )

  useEffect(() => {
    const root = document.documentElement
    const update = () => setIsDark(root.classList.contains('dark'))
    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

interface Theme {
  triggerTextIdle: string
  triggerTextActive: string
  triggerBgActive: string
  extendedText: string
  chevron: string
  menuBg: string
  menuBorder: string
  menuShadow: string
  itemText: string
  itemHoverBg: string
  divider: string
  thinkingLabel: string
  thinkingDescription: string
  toggleOffBg: string
  toggleOnBg: string
  checkColor: string
}

const DARK_THEME: Theme = {
  triggerTextIdle: '#C3C2B7',
  triggerTextActive: '#F8F8F6',
  triggerBgActive: 'transparent',
  extendedText: '#97958C',
  chevron: '#97958C',
  menuBg: '#2a2a2a',
  menuBorder: 'rgba(255,255,255,0.08)',
  menuShadow:
    '0 0 0 1px rgba(0,0,0,0.3), 0 16px 48px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
  itemText: '#e8e8e8',
  itemHoverBg: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.08)',
  thinkingLabel: '#e8e8e8',
  thinkingDescription: '#888',
  toggleOffBg: '#555',
  toggleOnBg: '#5B9AFF',
  checkColor: '#5B9AFF',
}

const LIGHT_THEME: Theme = {
  triggerTextIdle: '#373734',
  triggerTextActive: '#1A1A1A',
  triggerBgActive: '#EFEEEC',
  extendedText: '#7B7A74',
  chevron: '#7B7A74',
  menuBg: '#FFFFFF',
  menuBorder: 'rgba(0,0,0,0.10)',
  menuShadow:
    '0 0 0 1px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)',
  itemText: '#373734',
  itemHoverBg: '#EFEEEC',
  divider: 'rgba(0,0,0,0.08)',
  thinkingLabel: '#1A1A1A',
  thinkingDescription: '#7B7A74',
  toggleOffBg: '#D1D0CC',
  toggleOnBg: '#5B9AFF',
  checkColor: '#5B9AFF',
}

function ChevronDown({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 6L8 10L12 6"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M4 9.5L7.5 13L14 5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Toggle({
  checked,
  onChange,
  theme,
}: {
  checked: boolean
  onChange: (val: boolean) => void
  theme: Theme
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      style={{
        position: 'relative',
        width: 42,
        height: 25,
        borderRadius: 9999,
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        flexShrink: 0,
        backgroundColor: checked ? theme.toggleOnBg : theme.toggleOffBg,
        transition: 'background-color 200ms ease',
        outline: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2.5,
          left: 2.5,
          width: 20,
          height: 20,
          borderRadius: 9999,
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transition: 'transform 200ms ease',
          transform: checked ? 'translateX(17px)' : 'translateX(0px)',
          display: 'block',
        }}
      />
    </button>
  )
}

interface ModelSelectorProps {
  availableModels: ModelOption[]
  selectedModel: string
  onSelectModel: (modelId: string) => void
  extendedThinking: boolean
  onExtendedThinkingChange: (value: boolean) => void
  disabled?: boolean
}

export function ModelSelector({
  availableModels,
  selectedModel,
  onSelectModel,
  extendedThinking,
  onExtendedThinkingChange,
  disabled = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [hoveredModel, setHoveredModel] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDark = useIsDark()
  const theme = isDark ? DARK_THEME : LIGHT_THEME

  const selected = availableModels.find((m) => m.id === selectedModel)
  const supportsThinking = selected?.supportsThinking ?? false

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isActive = isOpen || isHovered
  const triggerTextColor = isActive
    ? theme.triggerTextActive
    : theme.triggerTextIdle
  const triggerBgColor = isActive ? theme.triggerBgActive : 'transparent'
  const triggerLabel = selected?.name ?? 'Select model'

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 15,
          letterSpacing: '-0.01em',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          backgroundColor: triggerBgColor,
          border: 'none',
          outline: 'none',
          padding: '4px 8px',
          borderRadius: 8,
          transition: 'background-color 150ms ease',
        }}
      >
        <span
          style={{
            fontWeight: 500,
            color: triggerTextColor,
            transition: 'color 150ms ease',
          }}
        >
          {triggerLabel}
        </span>
        {supportsThinking && extendedThinking && (
          <span style={{ color: theme.extendedText, marginLeft: 2 }}>
            Extended
          </span>
        )}
        <span style={{ marginLeft: 1, display: 'flex', alignItems: 'center' }}>
          <ChevronDown color={theme.chevron} />
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 240,
            borderRadius: 14,
            backgroundColor: theme.menuBg,
            border: `1px solid ${theme.menuBorder}`,
            boxShadow: theme.menuShadow,
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '4px 0',
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {availableModels.map((model) => {
              const isSelected = selectedModel === model.id
              const isItemHovered = hoveredModel === model.id
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onSelectModel(model.id)
                    setIsOpen(false)
                  }}
                  onMouseEnter={() => setHoveredModel(model.id)}
                  onMouseLeave={() => setHoveredModel(null)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    border: 'none',
                    outline: 'none',
                    fontSize: 15,
                    fontWeight: 500,
                    color: theme.itemText,
                    backgroundColor: isItemHovered
                      ? theme.itemHoverBg
                      : 'transparent',
                    transition: 'background-color 100ms ease',
                  }}
                >
                  {model.name}
                  {isSelected && (
                    <span
                      style={{ flexShrink: 0, marginLeft: 12, display: 'flex' }}
                    >
                      <CheckIcon color={theme.checkColor} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {supportsThinking && (
            <>
              <div
                style={{
                  height: 1,
                  margin: '0 16px',
                  backgroundColor: theme.divider,
                }}
              />

              <div
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: theme.thinkingLabel,
                    }}
                  >
                    Extended thinking
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      marginTop: 2,
                      color: theme.thinkingDescription,
                    }}
                  >
                    Think longer for complex tasks
                  </div>
                </div>
                <Toggle
                  checked={extendedThinking}
                  onChange={onExtendedThinkingChange}
                  theme={theme}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
