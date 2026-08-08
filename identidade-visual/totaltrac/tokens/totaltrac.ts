export const totalTracBrand = {
  colors: {
    blue: "#374898",
    cyan: "#008FCE",
    deepBlue: "#2D3B78",
    graphite: "#1E2F37",
    lightBlue: "#93DBF2",
    white: "#FFFFFF",
  },
  typography: {
    family: '"Fivo Sans", Arial, sans-serif',
    weights: { regular: 400, medium: 500, bold: 700, heavy: 800, black: 900 },
  },
  logo: {
    minimumWidth: { primary: 140, withoutTagline: 110, vertical: 70, symbol: 20 },
  },
} as const;

export type TotalTracBrand = typeof totalTracBrand;

