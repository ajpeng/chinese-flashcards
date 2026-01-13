declare module 'opencc-js' {
  interface ConverterConfig {
    from: string;
    to: string;
  }
  
  export function Converter(config: ConverterConfig): (text: string) => string;
}