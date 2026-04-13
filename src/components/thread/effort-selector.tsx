import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ThinkingEffort } from '@/features/chat/model'

type SelectableEffort = Exclude<ThinkingEffort, 'off'>

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
  labelIdle: string
  labelActive: string
  valueText: string
  trackBg: string
  fill: string
  dotIdle: string
  dotSelected: string
}

const DARK_THEME: Theme = {
  labelIdle: '#C3C2B7',
  labelActive: '#F8F8F6',
  valueText: '#97958C',
  trackBg: 'rgba(255,255,255,0.10)',
  fill: '#2F6BEB',
  dotIdle: '#6E6D66',
  dotSelected: '#F2F2EE',
}

const LIGHT_THEME: Theme = {
  labelIdle: '#373734',
  labelActive: '#1A1A1A',
  valueText: '#7B7A74',
  trackBg: 'rgba(0,0,0,0.08)',
  fill: '#2F6BEB',
  dotIdle: '#A8A79F',
  dotSelected: '#FFFFFF',
}

const PILL_WIDTH = 90
const PILL_HEIGHT = 19
const PILL_PADDING = 14
const DOT_SIZE_IDLE = 5.5
const DOT_SIZE_SELECTED = 13

interface EffortSelectorProps {
  efforts: readonly SelectableEffort[]
  selectedEffort: SelectableEffort
  effortLabels: Record<SelectableEffort, string>
  onSelectEffort: (effort: SelectableEffort) => void
  disabled?: boolean
}

export function EffortSelector({
  efforts,
  selectedEffort,
  effortLabels,
  onSelectEffort,
  disabled = false,
}: EffortSelectorProps) {
  const [isHovered, setIsHovered] = useState(false)
  const isDark = useIsDark()
  const theme = isDark ? DARK_THEME : LIGHT_THEME

  const selectedIndex = Math.max(0, efforts.indexOf(selectedEffort))
  const count = efforts.length
  // Dots are laid out with justify-content: space-between inside a padded
  // track, so the center of dot i sits at `PILL_PADDING + i * step` px from
  // the left edge of the pill. The fill bar extends from 0 to that point so
  // it visually terminates under the selected dot — except at the last
  // index, where we extend all the way to the right edge so Max fully fills
  // the pill instead of leaving a grey sliver behind the last dot.
  const step = count > 1 ? (PILL_WIDTH - PILL_PADDING * 2) / (count - 1) : 0
  const isLast = selectedIndex === count - 1
  const fillWidth = isLast ? PILL_WIDTH : PILL_PADDING + selectedIndex * step

  const labelColor = isHovered ? theme.labelActive : theme.labelIdle

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 15,
        letterSpacing: '-0.01em',
        padding: '4px 8px',
        borderRadius: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          fontWeight: 500,
          color: labelColor,
          transition: 'color 150ms ease',
        }}
      >
        Effort
      </span>
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.6 }}
        style={{
          color: theme.valueText,
          marginLeft: 2,
          marginRight: 6,
          display: 'inline-block',
        }}
      >
        {effortLabels[selectedEffort]}
      </motion.span>

      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.6 }}
        role="radiogroup"
        aria-label="Thinking effort"
        style={{
          position: 'relative',
          width: PILL_WIDTH,
          height: PILL_HEIGHT,
          borderRadius: 999,
          backgroundColor: theme.trackBg,
          cursor: disabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: fillWidth,
            backgroundColor: theme.fill,
            borderRadius: 999,
            transition: 'width 180ms ease',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: `0 ${PILL_PADDING}px`,
            boxSizing: 'border-box',
          }}
        >
          {efforts.map((effort) => {
            const isSelected = effort === selectedEffort
            const size = isSelected ? DOT_SIZE_SELECTED : DOT_SIZE_IDLE
            return (
              <button
                key={effort}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={effortLabels[effort]}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onSelectEffort(effort)
                }}
                style={{
                  position: 'relative',
                  width: 0,
                  height: '100%',
                  padding: 0,
                  margin: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    width: size,
                    height: size,
                    borderRadius: 999,
                    backgroundColor: isSelected
                      ? theme.dotSelected
                      : theme.dotIdle,
                    transition:
                      'width 180ms ease, height 180ms ease, background-color 180ms ease',
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    width: 22,
                    height: PILL_HEIGHT + 14,
                  }}
                />
              </button>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}
