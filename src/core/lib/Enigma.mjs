/**
 * Emulation of the Enigma machine.
 *
 * @author s2224834
 * @copyright Crown Copyright 2019
 * @license Apache-2.0
 */
import OperationError from "../errors/OperationError";
import Utils from "../Utils";

export const ROTORS = [
    {name: "I", value: "EKMFLGDQVZNTOWYHXUSPAIBRCJ<R"},
    {name: "II", value: "AJDKSIRUXBLHWTMCQGZNPYFVOE<F"},
    {name: "III", value: "BDFHJLCPRTXVZNYEIWGAKMUSQO<W"},
    {name: "IV", value: "ESOVPZJAYQUIRHXLNFTGKDCMWB<K"},
    {name: "V", value: "VZBRGITYUPSDNHLXAWMJQOFECK<A"},
    {name: "VI", value: "JPGVOUMFYQBENHZRDKASXLICTW<AN"},
    {name: "VII", value: "NZJHGRCXMYSWBOUFAIVLPEKQDT<AN"},
    {name: "VIII", value: "FKQHTLXOCBJSPDZRAMEWNIUYGV<AN"},
    {name: "Beta", value: "LEYJVCNIXWPBQMDRTAKZGFUHOS"},
    {name: "Gamma", value: "FSOKANUERHMBTIYCWLQPZXVGJD"},
];

export const ROTORS_OPTIONAL = [].concat(ROTORS).concat([
    {name: "None", value: ""},
]);

export const REFLECTORS = [
    {name: "B", value: "AY BR CU DH EQ FS GL IP JX KN MO TZ VW"},
    {name: "C", value: "AF BV CP DJ EI GO HY KR LZ MX NW TQ SU"},
    {name: "B Thin", value: "AE BN CK DQ FU GY HW IJ LO MP RX SZ TV"},
    {name: "C Thin", value: "AR BD CO EJ FN GT HK IV LM PW QZ SX UY"},
];

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Map a letter to a number in 0..25.
 *
 * @param {char} c
 * @param {boolean} permissive - Case insensitive; don't throw errors on other chars.
 * @returns {number}
 */
export function a2i(c, permissive=false) {
    const i = Utils.ord(c);
    if (i >= 65 && i <= 90) {
        return i - 65;
    }
    if (permissive) {
        // Allow case insensitivity
        if (i >= 97 && i <= 122) {
            return i - 97;
        }
        return -1;
    }
    throw new OperationError("a2i called on non-uppercase ASCII character");
}

/**
 * Map a number in 0..25 to a letter.
 *
 * @param {number} i
 * @returns {char}
 */
export function i2a(i) {
    if (i >= 0 && i < 26) {
        return Utils.chr(i+65);
    }
    throw new OperationError("i2a called on value outside 0..25");
}

/**
 * A rotor in the Enigma machine.
 */
export class Rotor {
    /**
     * Rotor constructor.
     *
     * @param {string} wiring - A 26 character string of the wiring order.
     * @param {string} steps - A 0..26 character string of stepping points.
     * @param {char} ringSetting - The ring setting.
     * @param {char} initialPosition - The initial position of the rotor.
     */
    constructor(wiring, steps, ringSetting, initialPosition) {
        if (!wiring.match(/^[A-Z]{26}$/)) {
            throw new OperationError("Rotor wiring must be 26 unique uppercase letters");
        }
        if (!steps.match(/^[A-Z]{0,26}$/)) {
            throw new OperationError("Rotor steps must be 0-26 unique uppercase letters");
        }
        if (!ringSetting.match(/^[A-Z]$/)) {
            throw new OperationError("Rotor ring setting must be exactly one uppercase letter");
        }
        if (!initialPosition.match(/^[A-Z]$/)) {
            throw new OperationError("Rotor initial position must be exactly one uppercase letter");
        }
        this.map = {};
        this.revMap = {};
        for (let i=0; i<LETTERS.length; i++) {
            const a = a2i(LETTERS[i]);
            const b = a2i(wiring[i]);
            this.map[a] = b;
            this.revMap[b] = a;
        }
        if (Object.keys(this.revMap).length !== LETTERS.length) {
            throw new OperationError("Rotor wiring must have each letter exactly once");
        }
        const rs = a2i(ringSetting);
        this.steps = new Set();
        for (const x of steps) {
            this.steps.add(Utils.mod(a2i(x) - rs, 26));
        }
        if (this.steps.size !== steps.length) {
            // This isn't strictly fatal, but it's probably a mistake
            throw new OperationError("Rotor steps must be unique");
        }
        this.pos = Utils.mod(a2i(initialPosition) - rs, 26);
    }

    /**
     * Step the rotor forward by one.
     */
    step() {
        this.pos = Utils.mod(this.pos + 1, 26);
        return this.pos;
    }

    /**
     * Transform a character through this rotor forwards.
     *
     * @param {number} c - The character.
     * @returns {number}
     */
    transform(c) {
        return Utils.mod(this.map[Utils.mod(c + this.pos, 26)] - this.pos, 26);
    }

    /**
     * Transform a character through this rotor backwards.
     *
     * @param {number} c - The character.
     * @returns {number}
     */
    revTransform(c) {
        return Utils.mod(this.revMap[Utils.mod(c + this.pos, 26)] - this.pos, 26);
    }
}

/**
 * Base class for plugboard and reflector (since these do effectively the same
 * thing).
 */
class PairMapBase {
    /**
     * PairMapBase constructor.
     *
     * @param {string} pairs - A whitespace separated string of letter pairs to swap.
     * @param {string} [name='PairMapBase'] - For errors, the name of this object.
     */
    constructor(pairs, name="PairMapBase") {
        // I've chosen to make whitespace significant here to make a) code and
        // b) inputs easier to read
        this.map = {};
        if (pairs === "") {
            return;
        }
        pairs.split(/\s+/).forEach(pair => {
            if (!pair.match(/^[A-Z]{2}$/)) {
                throw new OperationError(name + " must be a whitespace-separated list of uppercase letter pairs");
            }
            const a = a2i(pair[0]), b = a2i(pair[1]);
            if (a === b) {
                throw new OperationError(name + ": cannot connect " + pair[0] + " to itself");
            }
            if (a in this.map) {
                throw new OperationError(name + " connects " + pair[0] + " more than once");
            }
            if (b in this.map) {
                throw new OperationError(name + " connects " + pair[1] + " more than once");
            }
            this.map[a] = b;
            this.map[b] = a;
        });
    }

    /**
     * Transform a character through this object.
     * Returns other characters unchanged.
     *
     * @param {number} c - The character.
     * @returns {number}
     */
    transform(c) {
        if (!(c in this.map)) {
            return c;
        }
        return this.map[c];
    }

    /**
     * Alias for transform, to allow interchangeable use with rotors.
     *
     * @param {number} c - The character.
     * @returns {number}
     */
    revTransform(c) {
        return this.transform(c);
    }
}

/**
 * Reflector. PairMapBase but requires that all characters are accounted for.
 */
export class Reflector extends PairMapBase {
    /**
     * Reflector constructor. See PairMapBase.
     * Additional restriction: every character must be accounted for.
     */
    constructor(pairs) {
        super(pairs, "Reflector");
        const s = Object.keys(this.map).length;
        if (s !== 26) {
            throw new OperationError("Reflector must have exactly 13 pairs covering every letter");
        }
    }
}

/**
 * Plugboard. Unmodified PairMapBase.
 */
export class Plugboard extends PairMapBase {
    /**
     * Plugboard constructor. See PairMapbase.
     */
    constructor(pairs) {
        super(pairs, "Plugboard");
    }
}

/**
 * Base class for the Enigma machine itself. Holds rotors, a reflector, and a plugboard.
 */
export class EnigmaBase {
    /**
     * EnigmaBase constructor.
     *
     * @param {Object[]} rotors - List of Rotors.
     * @param {Object} reflector - A Reflector.
     * @param {Plugboard} plugboard - A Plugboard.
     */
    constructor(rotors, reflector, plugboard) {
        this.rotors = rotors;
        this.rotorsRev = [].concat(rotors).reverse();
        this.reflector = reflector;
        this.plugboard = plugboard;
    }

    /**
     * Step the rotors forward by one.
     *
     * This happens before the output character is generated.
     *
     * Note that rotor 4, if it's there, never steps.
     *
     * Why is all the logic in EnigmaMachine and not a nice neat method on
     * Rotor that knows when it should advance the next item?
     * Because the double stepping anomaly is a thing. tl;dr if the left rotor
     * should step the next time the middle rotor steps, the middle rotor will
     * immediately step.
     */
    step() {
        const r0 = this.rotors[0];
        const r1 = this.rotors[1];
        r0.step();
        // The second test here is the double-stepping anomaly
        if (r0.steps.has(r0.pos) || r1.steps.has(Utils.mod(r1.pos + 1, 26))) {
            r1.step();
            if (r1.steps.has(r1.pos)) {
                const r2 = this.rotors[2];
                r2.step();
            }
        }
    }

    /**
     * Encrypt (or decrypt) some data.
     * Takes an arbitrary string and runs the Engima machine on that data from
     * *its current state*, and outputs the result. Non-alphabetic characters
     * are returned unchanged.
     *
     * @param {string} input - Data to encrypt.
     * @result {string}
     */
    crypt(input) {
        let result = "";
        for (const l of input) {
            let letter = a2i(l, true);
            if (letter === -1) {
                result += l;
                continue;
            }
            // First, step the rotors forward.
            this.step();
            // Now, run through the plugboard.
            letter = this.plugboard.transform(letter);
            // Then through each wheel in sequence, through the reflector, and
            // backwards through the wheels again.
            for (const rotor of this.rotors) {
                letter = rotor.transform(letter);
            }
            letter = this.reflector.transform(letter);
            for (const rotor of this.rotorsRev) {
                letter = rotor.revTransform(letter);
            }
            // Finally, back through the plugboard.
            letter = this.plugboard.revTransform(letter);
            result += i2a(letter);
        }
        return result;
    }
}

/**
 * The Enigma machine itself. Holds 3-4 rotors, a reflector, and a plugboard.
 */
export class EnigmaMachine extends EnigmaBase {
    /**
     * EnigmaMachine constructor.
     *
     * @param {Object[]} rotors - List of Rotors.
     * @param {Object} reflector - A Reflector.
     * @param {Plugboard} plugboard - A Plugboard.
     */
    constructor(rotors, reflector, plugboard) {
        super(rotors, reflector, plugboard);
        if (rotors.length !== 3 && rotors.length !== 4) {
            throw new OperationError("Enigma must have 3 or 4 rotors");
        }
    }
}
