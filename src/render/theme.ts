export type RenderTheme = {
  ansi: {
    reset: string
    dim: string
    bold: string
    gray: string
    white: string
    magenta: string
  }
  rgb: {
    churn: string
    bugs: string
    contributors: string
  }
  activity: {
    // Activity-by-month heat strip colors (kept as-is).
    heatFg: readonly string[]
  }
}

function fgRgb (r: number, g: number, b: number): string {
  return `\x1b[38;2;${String(r)};${String(g)};${String(b)}m`
}

export function getTheme (): RenderTheme {
  return {
    ansi: {
      reset: '\x1b[0m',
      dim: '\x1b[2m',
      bold: '\x1b[1m',
      gray: '\x1b[90m',
      white: '\x1b[37m',
      magenta: '\x1b[35m',
    },
    rgb: {
      // Churn: #FEC288 (rgb(254, 194, 136))
      churn: fgRgb(254, 194, 136),
      // Bug fixes: #FD8A6B (rgb(253, 138, 107))
      bugs: fgRgb(253, 138, 107),
      // Contributors: #9AD872 (rgb(154, 216, 114))
      contributors: fgRgb(154, 216, 114),
    },
    activity: {
      heatFg: [
        '\x1b[38;5;235m',
        '\x1b[38;5;22m',
        '\x1b[38;5;28m',
        '\x1b[38;5;34m',
        '\x1b[38;5;40m',
        '\x1b[38;5;46m',
      ] as const,
    },
  }
}

