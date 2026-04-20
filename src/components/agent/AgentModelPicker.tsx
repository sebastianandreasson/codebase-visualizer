import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'

import type { AgentControlState } from '../../schema/agent'
import {
  createAgentModelKey,
  getAgentRuntimeLabel,
  groupAgentModelOptions,
} from '../../agent/agentModelOptions'

const MODEL_MENU_GAP_PX = 4
const MODEL_MENU_MARGIN_PX = 8
const MODEL_MENU_MAX_HEIGHT_PX = 384
const MODEL_MENU_MIN_WIDTH_PX = 288
const MODEL_MENU_MIN_COMFORTABLE_HEIGHT_PX = 180

export function AgentModelPicker({
  disabled,
  models,
  onSelect,
  selectedModelKey,
  title,
}: {
  disabled: boolean
  models: AgentControlState['models']
  onSelect: (modelKey: string) => void
  selectedModelKey: string
  title: string
}) {
  const [open, setOpen] = useState(false)
  const [menuPlacement, setMenuPlacement] = useState<AgentModelMenuPlacement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const selectedModel = useMemo(
    () => models.find((model) => createAgentModelKey(model) === selectedModelKey) ?? null,
    [models, selectedModelKey],
  )
  const modelGroups = useMemo(() => groupAgentModelOptions(models), [models])

  useLayoutEffect(() => {
    if (!open) {
      return
    }

    const updateMenuPlacement = () => {
      const triggerRect = pickerRef.current?.getBoundingClientRect()

      if (!triggerRect) {
        return
      }

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const availableWidth = Math.max(0, viewportWidth - MODEL_MENU_MARGIN_PX * 2)
      const menuWidth = Math.min(
        Math.max(triggerRect.width, MODEL_MENU_MIN_WIDTH_PX),
        availableWidth,
      )
      const maxLeft = Math.max(MODEL_MENU_MARGIN_PX, viewportWidth - menuWidth - MODEL_MENU_MARGIN_PX)
      const left = Math.min(
        Math.max(MODEL_MENU_MARGIN_PX, triggerRect.left),
        maxLeft,
      )
      const availableBelow = Math.max(
        0,
        viewportHeight - triggerRect.bottom - MODEL_MENU_GAP_PX - MODEL_MENU_MARGIN_PX,
      )
      const availableAbove = Math.max(
        0,
        triggerRect.top - MODEL_MENU_GAP_PX - MODEL_MENU_MARGIN_PX,
      )
      const opensBelow =
        availableBelow >= MODEL_MENU_MIN_COMFORTABLE_HEIGHT_PX ||
        availableBelow >= availableAbove
      const availableHeight = opensBelow ? availableBelow : availableAbove

      setMenuPlacement({
        bottom: opensBelow
          ? 'auto'
          : viewportHeight - triggerRect.top + MODEL_MENU_GAP_PX,
        left,
        maxHeight: Math.min(MODEL_MENU_MAX_HEIGHT_PX, availableHeight),
        top: opensBelow ? triggerRect.bottom + MODEL_MENU_GAP_PX : 'auto',
        width: menuWidth,
      })
    }

    updateMenuPlacement()

    window.addEventListener('resize', updateMenuPlacement)
    window.addEventListener('scroll', updateMenuPlacement, true)
    window.visualViewport?.addEventListener('resize', updateMenuPlacement)
    window.visualViewport?.addEventListener('scroll', updateMenuPlacement)

    return () => {
      window.removeEventListener('resize', updateMenuPlacement)
      window.removeEventListener('scroll', updateMenuPlacement, true)
      window.visualViewport?.removeEventListener('resize', updateMenuPlacement)
      window.visualViewport?.removeEventListener('scroll', updateMenuPlacement)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node

      if (
        pickerRef.current &&
        !pickerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const menuStyle = useMemo<CSSProperties>(() => {
    if (!menuPlacement) {
      return {
        left: -9999,
        maxHeight: 0,
        position: 'fixed',
        top: 0,
      }
    }

    return {
      bottom: menuPlacement.bottom,
      left: menuPlacement.left,
      maxHeight: menuPlacement.maxHeight,
      position: 'fixed',
      top: menuPlacement.top,
      width: menuPlacement.width,
    }
  }, [menuPlacement])

  const menu = open ? (
    <div
      className="cbv-agent-model-menu"
      id={menuId}
      ref={menuRef}
      role="listbox"
      style={menuStyle}
    >
      {modelGroups.map((group) => (
        <div
          className="cbv-agent-model-group"
          key={group.key}
          role="group"
        >
          <div className="cbv-agent-model-group-header">
            <span>{group.provider}</span>
            <span>{getAgentRuntimeLabel(group.authMode)}</span>
          </div>
          {group.models.map((model) => {
            const modelKey = createAgentModelKey(model)
            const selected = modelKey === selectedModelKey

            return (
              <button
                aria-selected={selected}
                className={`cbv-agent-model-option${selected ? ' is-selected' : ''}`}
                key={modelKey}
                onClick={() => {
                  if (!selected) {
                    onSelect(modelKey)
                  }

                  setOpen(false)
                }}
                role="option"
                type="button"
              >
                <span aria-hidden="true" className="cbv-agent-model-option-dot" />
                <span className="cbv-agent-model-option-label">{model.id}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  ) : null

  return (
    <div
      className={`cbv-agent-model-picker${open ? ' is-open' : ''}`}
      ref={pickerRef}
    >
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Agent model"
        className="cbv-agent-model-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={title}
        type="button"
      >
        <span aria-hidden="true" className="cbv-agent-model-trigger-dot" />
        <span className="cbv-agent-model-trigger-copy">
          <span className="cbv-agent-model-trigger-model">
            {selectedModel?.id ?? 'Select model'}
          </span>
          {selectedModel ? (
            <span className="cbv-agent-model-trigger-provider">
              {selectedModel.provider} · {getAgentRuntimeLabel(selectedModel.authMode)}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="cbv-agent-model-trigger-caret">
          ▾
        </span>
      </button>
      {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </div>
  )
}

interface AgentModelMenuPlacement {
  bottom: number | 'auto'
  left: number
  maxHeight: number
  top: number | 'auto'
  width: number
}
