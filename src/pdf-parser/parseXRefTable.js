/* @flow */
import { PDFXRef } from '../pdf-structures';
import { arrayToString, trimArray } from '../utils';

import type { ParseHandlers } from '.';

/**
Accepts an string as input. Repeatedly applies a regex to the input that matches
against entries of PDF Cross Reference Table subsections.

If entries are found, then an array of PDFXRef.Entry will be returned.

If not, null is returned.
*/
const parseEntries = (input: string): ?PDFXRef.Entry => {
  const trimmed = input.trim();
  const entryRegex = /^(\d{10}) (\d{5}) (n|f)/;

  const entriesArr = [];
  let remainder = trimmed;
  while (remainder.length > 0) {
    const result = remainder.match(entryRegex);
    if (!result) return null;

    const [fullMatch, offset, genNum, isInUse] = result;

    entriesArr.push(
      PDFXRef.Entry
        .create()
        .setOffset(Number(offset))
        .setGenerationNum(Number(genNum))
        .setIsInUse(isInUse === 'n'),
    );
    remainder = remainder.substring(fullMatch.length).trim();
  }

  return entriesArr;
};

/**
Accepts an string as input. Repeatedly applies a regex to the input that matches
against subsections of PDF Cross Reference Tables.

If subsections are found, then an array of PDFXRef.Subsection will be returned.

If not, null is returned.
*/
const parseSubsections = (input: string): ?(PDFXRef.Subsection[]) => {
  const trimmed = input.trim();
  const sectionsRegex = /^(\d+) (\d+)((\n|\r| )*(\d{10} \d{5} (n|f)(\n|\r| )*)+)/;

  const sectionsArr = [];
  let remainder = trimmed;
  while (remainder.length > 0) {
    const result = remainder.match(sectionsRegex);
    if (!result) return null;

    // eslint-disable-next-line no-unused-vars
    const [fullMatch, firstObjNum, objCount, entriesStr] = result;
    const entries = parseEntries(entriesStr);
    if (!entries) return null;

    sectionsArr.push(
      PDFXRef.Subsection.from(entries).setFirstObjNum(Number(firstObjNum)),
    );
    remainder = remainder.substring(fullMatch.length).trim();
  }

  return sectionsArr;
};

/**
Accepts an array of bytes as input. Checks to see if the first characters in the
trimmed input make up a PDF Cross Reference Table.

If so, returns a tuple containing (1) an object representing the parsed PDF
Cross Reference Table and (2) a subarray of the input with the characters making
up the parsed cross reference table removed. The "onParseXRefTable" parse
handler will also be called with the PDFXRef.Table object.

If not, null is returned.
*/
const parseXRefTable = (
  input: Uint8Array,
  { onParseXRefTable }: ParseHandlers = {},
): ?[PDFXRef.Table, Uint8Array] => {
  const trimmed = trimArray(input);
  const xRefTableRegex = /^xref[\n|\r| ]*([\d|\n|\r| |f|n]+)/;

  // Search for first character that isn't part of an xref table
  let idx = 0;
  while (String.fromCharCode(trimmed[idx]).match(/^[xref \n\r\dfn]/)) idx += 1;

  // Try to match the regex up to that character to see if we've got an xref table
  const result1 = arrayToString(trimmed, 0, idx).match(xRefTableRegex);
  if (!result1) return null;

  // Parse the subsections of the xref table
  const [fullMatch, contents] = result1;
  const subsections = parseSubsections(contents);
  if (!subsections) return null;

  const xRefTable = PDFXRef.Table.from(subsections);
  if (onParseXRefTable) onParseXRefTable(xRefTable);

  return [xRefTable, trimmed.subarray(fullMatch.length)];
};

export default parseXRefTable;
