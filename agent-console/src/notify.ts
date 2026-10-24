// Short two-tone chime + browser notification for new handoffs.
let audio: AudioContext | null = null

export function chime() {
  try {
    audio ??= new AudioContext()
    const t = audio.currentTime
    ;[880, 1320].forEach((freq, i) => {
      const osc = audio!.createOscillator()
      const gain = audio!.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.15 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.15 + 0.3)
      osc.connect(gain).connect(audio!.destination)
      osc.start(t + i * 0.15)
      osc.stop(t + i * 0.15 + 0.32)
    })
  } catch {
    /* audio blocked until the page gets a click — fine */
  }
}

export function notify(title: string, body: string) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted' && document.hidden) new Notification(title, { body })
}

export function askNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
}
