export function isTimelineScrolledNearBottom(listElement: HTMLDivElement) {
  return (
    listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight <= 48
  )
}
