'use client'

/**
 * iOS-style on/off switch. State is carried by the knob's PHYSICAL position
 * (plus a track-colour change), not by colour alone — replaces settings
 * buttons whose only on/off signal was a background-colour fill, which reads
 * ambiguously (does filled mean "on" or "tap to turn on"?).
 */
export default function ToggleSwitch({ checked, onChange, disabled, label }: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="toggle-switch"
      data-on={checked}
    >
      <span className="toggle-switch-knob" />
    </button>
  )
}
