/**
 * Emulation of the Enigma machine.
 *
 * @author s2224834
 * @copyright Crown Copyright 2019
 * @license Apache-2.0
 */

import Operation from "../Operation";
import OperationError from "../errors/OperationError";
import Utils from "../Utils";

const ROTORS = [
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

const ROTORS_OPTIONAL = [].concat(ROTORS).concat([
    {name: "None", value: ""},
]);

const REFLECTORS = [
    {name: "B", value: "AY BR CU DH EQ FS GL IP JX KN MO TZ VW"},
    {name: "C", value: "AF BV CP DJ EI GO HY KR LZ MX NW TQ SU"},
    {name: "B Thin", value: "AE BN CK DQ FU GY HW IJ LO MP RX SZ TV"},
    {name: "C Thin", value: "AR BD CO EJ FN GT HK IV LM PW QZ SX UY"},
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Map a letter to a number in 0..25.
 *
 * @param {char} c
 * @param {boolean} permissive - Case insensitive; don't throw errors on other chars.
 * @returns {number}
 */
function a2i(c, permissive=false) {
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
function i2a(i) {
    if (i >= 0 && i < 26) {
        return Utils.chr(i+65);
    }
    throw new OperationError("i2a called on value outside 0..25");
}

/**
 * A rotor in the Enigma machine.
 */
class Rotor {
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
}

/**
 * Reflector. PairMapBase but requires that all characters are accounted for.
 */
class Reflector extends PairMapBase {
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
class Plugboard extends PairMapBase {
    /**
     * Plugboard constructor. See PairMapbase.
     */
    constructor(pairs) {
        super(pairs, "Plugboard");
    }
}

/**
 * The Enigma machine itself. Holds 3-4 rotors, a reflector, and a plugboard.
 */
class EnigmaMachine {
    /**
     * EnigmaMachine constructor.
     *
     * @param {Object[]} rotors - List of Rotors.
     * @param {Object} reflector - A Reflector.
     * @param {Plugboard} plugboard - A Plugboard.
     */
    constructor(rotors, reflector, plugboard) {
        if (rotors.length !== 3 && rotors.length !== 4) {
            throw new OperationError("Enigma must have 3 or 4 rotors");
        }
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
            letter = this.plugboard.transform(letter);
            result += i2a(letter);
        }
        return result;
    }
}

/**
 * Enigma operation
 */
class Enigma extends Operation {
    /**
     * Enigma constructor
     */
    constructor() {
        super();

        this.name = "Enigma";
        this.module = "Default";
        this.description = "Encipher/decipher with the WW2 Enigma machine.<br>The standard set of German military rotors and reflectors are provided. To configure the plugboard, enter a string of connected pairs of letters, e.g. <code>AB CD EF</code> connects A to B, C to D, and E to F. This is also used to create your own reflectors. To create your own rotor, enter the letters that the rotor maps A to Z to, in order, optionally followed by <code>&lt;</code> then a list of stepping points.<br>This is deliberately fairly permissive with rotor placements etc compared to a real Enigma (on which, for example, a four-rotor Enigma uses the thin reflectors and the beta or gamma rotor in the 4th slot).";
        this.infoURL = "https://wikipedia.org/wiki/Enigma_machine";
        this.inputType = "string";
        this.outputType = "string";
        this.args = [
            {
                name: "1st (right-hand) rotor",
                type: "editableOption",
                value: ROTORS,
                // Default config is the rotors I-III *left to right*
                defaultIndex: 2
            },
            {
                name: "1st rotor ring setting",
                type: "option",
                value: LETTERS
            },
            {
                name: "1st rotor initial value",
                type: "option",
                value: LETTERS
            },
            {
                name: "2nd rotor",
                type: "editableOption",
                value: ROTORS,
                defaultIndex: 1
            },
            {
                name: "2nd rotor ring setting",
                type: "option",
                value: LETTERS
            },
            {
                name: "2nd rotor initial value",
                type: "option",
                value: LETTERS
            },
            {
                name: "3rd rotor",
                type: "editableOption",
                value: ROTORS,
                defaultIndex: 0
            },
            {
                name: "3rd rotor ring setting",
                type: "option",
                value: LETTERS
            },
            {
                name: "3rd rotor initial value",
                type: "option",
                value: LETTERS
            },
            {
                name: "4th rotor",
                type: "editableOption",
                value: ROTORS_OPTIONAL,
                defaultIndex: 10
            },
            {
                name: "4th rotor initial value",
                type: "option",
                value: LETTERS
            },
            {
                name: "Reflector",
                type: "editableOption",
                value: REFLECTORS
            },
            {
                name: "Plugboard",
                type: "string",
                value: ""
            },
            {
                name: "Drop non-alphabet chars",
                type: "boolean",
                value: true
            },
        ];
    }

    /**
     * Helper - for ease of use rotors are specified as a single string; this
     * method breaks the spec string into wiring and steps parts.
     *
     * @param {string} rotor - Rotor specification string.
     * @param {number} i - For error messages, the number of this rotor.
     * @result {string[]}
     */
    parseRotorStr(rotor, i) {
        if (rotor === "") {
            throw new OperationError("Rotor ${i} must be provided.");
        }
        if (!rotor.includes("<")) {
            return [rotor, ""];
        }
        return rotor.split("<", 2);
    }

    /**
     * @param {string} input
     * @param {Object[]} args
     * @returns {string}
     */
    run(input, args) {
        const [
            rotor1str, rotor1ring, rotor1pos,
            rotor2str, rotor2ring, rotor2pos,
            rotor3str, rotor3ring, rotor3pos,
            rotor4str, rotor4pos,
            reflectorstr, plugboardstr,
            removeOther
        ] = args;
        const rotors = [];
        const [rotor1wiring, rotor1steps] = this.parseRotorStr(rotor1str, 1);
        rotors.push(new Rotor(rotor1wiring, rotor1steps, rotor1ring, rotor1pos));
        const [rotor2wiring, rotor2steps] = this.parseRotorStr(rotor2str, 2);
        rotors.push(new Rotor(rotor2wiring, rotor2steps, rotor2ring, rotor2pos));
        const [rotor3wiring, rotor3steps] = this.parseRotorStr(rotor3str, 3);
        rotors.push(new Rotor(rotor3wiring, rotor3steps, rotor3ring, rotor3pos));
        if (rotor4str !== "") {
            // Fourth rotor doesn't have a ring setting - A is equivalent to no setting
            const [rotor4wiring, rotor4steps] = this.parseRotorStr(rotor4str, 4);
            rotors.push(new Rotor(rotor4wiring, rotor4steps, "A", rotor4pos));
        }
        const reflector = new Reflector(reflectorstr);
        const plugboard = new Plugboard(plugboardstr);
        if (removeOther) {
            input = input.replace(/[^A-Za-z]/g, "");
        }
        const enigma = new EnigmaMachine(rotors, reflector, plugboard);
        let result = enigma.crypt(input);
        if (removeOther) {
            // Five character cipher groups is traditional
            result = result.replace(/([A-Z]{5})(?!$)/g, "$1 ");
        }
        return result;
    }

    /**
     * Highlight Enigma
     * This is only possible if we're passing through non-alphabet characters.
     *
     * @param {Object[]} pos
     * @param {number} pos[].start
     * @param {number} pos[].end
     * @param {Object[]} args
     * @returns {Object[]} pos
     */
    highlight(pos, args) {
        if (args[13] === false) {
            return pos;
        }
    }

    /**
     * Highlight Enigma in reverse
     *
     * @param {Object[]} pos
     * @param {number} pos[].start
     * @param {number} pos[].end
     * @param {Object[]} args
     * @returns {Object[]} pos
     */
    highlightReverse(pos, args) {
        if (args[13] === false) {
            return pos;
        }
    }

}

export default Enigma;
