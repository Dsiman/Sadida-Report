// Human-friendly ticket codes like STS-A2F7KP.
// Alphabet excludes visually ambiguous characters (0/O, 1/I/L) so they
// survive a screenshot or a handwritten note. 31^6 ≈ 887M possibilities;
// collisions require millions of active tickets and we only ever retry.

import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;
const PREFIX = 'STS-';

export const TICKET_REGEX = new RegExp(`^${PREFIX}[A-Z2-9]{${LENGTH}}$`);

export function generateTicket() {
    const bytes = randomBytes(LENGTH);
    let out = '';
    for (let i = 0; i < LENGTH; i++) {
        out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return PREFIX + out;
}

export async function issueUniqueTicket(submissions) {
    for (let attempt = 0; attempt < 6; attempt++) {
        const ticket = generateTicket();
        const exists = await submissions.findOne({ ticket }, { projection: { _id: 1 } });
        if (!exists) return ticket;
    }
    throw new Error('Failed to issue unique ticket after 6 attempts');
}
