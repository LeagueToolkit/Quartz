// ColorHandler class for working with vec4 colors.
// Ported 1:1 from the Electron Quartz ColorHandler.

export type Vec4 = [number, number, number, number];

class ColorHandler {
    vec4: Vec4;
    time: number;

    constructor(vec4: number[] | undefined = [0.5, 0.5, 0.5, 1]) {
        if (Array.isArray(vec4)) {
            this.vec4 = [...(vec4 as number[])] as Vec4;
        } else {
            const timestamp = Date.now();
            this.vec4 = [
                (Math.sin(timestamp * 0.001) + 1) * 0.5,
                (Math.cos(timestamp * 0.002) + 1) * 0.5,
                (Math.sin(timestamp * 0.003) + 1) * 0.5,
                1,
            ];
        }
        this.time = 0;
    }

    ToHEX(): string {
        const red = Math.max(0, Math.min(1, this.vec4[0]));
        const green = Math.max(0, Math.min(1, this.vec4[1]));
        const blue = Math.max(0, Math.min(1, this.vec4[2]));

        const redHex = Math.ceil(red * 254.9).toString(16).padStart(2, '0');
        const greenHex = Math.ceil(green * 254.9).toString(16).padStart(2, '0');
        const blueHex = Math.ceil(blue * 254.9).toString(16).padStart(2, '0');

        return `#${redHex}${greenHex}${blueHex}`;
    }

    InputHex(hex: string): void {
        const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;

        if (cleanHex.length === 6 && /^[0-9a-fA-F]{6}$/.test(cleanHex)) {
            const redPart = cleanHex.substring(0, 2);
            const greenPart = cleanHex.substring(2, 4);
            const bluePart = cleanHex.substring(4, 6);

            const redValue = Number('0x' + redPart) / 255;
            const greenValue = Number('0x' + greenPart) / 255;
            const blueValue = Number('0x' + bluePart) / 255;

            this.vec4 = [redValue, greenValue, blueValue, this.vec4[3]];
        } else {
            console.warn('Invalid hex color format:', hex);
        }
    }

    ToHSL(): [number, number, number] {
        const [red, green, blue] = this.vec4;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const delta = maximum - minimum;

        let hue = 0;
        let saturation = 0;
        const lightness = (maximum + minimum) / 2;

        if (delta !== 0) {
            saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);

            if (maximum === red) {
                hue = ((green - blue) / delta) % 6;
                if (green < blue) hue += 6;
            } else if (maximum === green) {
                hue = (blue - red) / delta + 2;
            } else {
                hue = (red - green) / delta + 4;
            }
            hue /= 6;
        }

        return [hue, saturation, lightness];
    }

    InputHSL([h, s, l]: [number, number, number]): void {
        let red: number, green: number, blue: number;

        if (s === 0) {
            red = green = blue = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            const convertHueToRGB = (p: number, q: number, t: number): number => {
                let normalizedT = t;
                while (normalizedT < 0) normalizedT += 1;
                while (normalizedT > 1) normalizedT -= 1;

                if (normalizedT < 1 / 6) {
                    return p + (q - p) * 6 * normalizedT;
                } else if (normalizedT < 1 / 2) {
                    return q;
                } else if (normalizedT < 2 / 3) {
                    return p + (q - p) * (2 / 3 - normalizedT) * 6;
                } else {
                    return p;
                }
            };

            red = convertHueToRGB(p, q, h + 1 / 3);
            green = convertHueToRGB(p, q, h);
            blue = convertHueToRGB(p, q, h - 1 / 3);
        }

        this.vec4 = [red, green, blue, this.vec4[3]];
    }

    HSLShift(hue = 0, sat = 0, lig = 0): void {
        const currentHSL = this.ToHSL();

        let newHue = currentHSL[0] + (hue / 360);
        newHue = newHue >= 1 ? newHue - 1 : newHue < 0 ? newHue + 1 : newHue;

        let newSaturation = currentHSL[1] + (sat / 100);
        newSaturation = Math.max(0.01, Math.min(1, newSaturation));

        let newLightness = currentHSL[2] + (lig / 100);
        newLightness = Math.max(0.01, Math.min(1, newLightness));

        this.InputHSL([newHue, newSaturation, newLightness]);
    }

    InputVec4(vec4: number[]): void {
        if (Array.isArray(vec4) && vec4.length >= 4) {
            this.vec4 = [
                Math.max(0, Math.min(1, vec4[0])),
                Math.max(0, Math.min(1, vec4[1])),
                Math.max(0, Math.min(1, vec4[2])),
                Math.max(0, Math.min(1, vec4[3])),
            ];
        }
    }

    ToVec4(): Vec4 {
        return [...this.vec4] as Vec4;
    }

    SetTime(time: number): void {
        this.time = Math.max(0, Math.min(1, time));
    }
}

export default ColorHandler;
