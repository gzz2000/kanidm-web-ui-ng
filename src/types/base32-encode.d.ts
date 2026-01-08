declare module 'base32-encode' {
  export default function base32Encode(
    data: Uint8Array | ArrayBuffer | number[],
    variant: 'RFC3548' | 'RFC4648' | 'RFC4648-HEX' | 'Crockford',
    options?: { padding?: boolean },
  ): string
}
