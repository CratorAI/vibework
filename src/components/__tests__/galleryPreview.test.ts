import { describe, expect, it } from 'vitest';
import { opening } from '../gallery/GalleryPreview';
import { sheetPreviewRows } from '../gallery/sheetThumb';

describe('deck preview', () => {
  const deck = '# Quarterly results\n<!-- layout: table -->\n| Q3 measure | Result | Change vs Q2 |\n| --- | ---: | ---: |\n| Revenue | £29,800 | 12% |';
  it('skips the first slide table and layout comment', () => {
    expect(opening(deck + '\n\nRevenue grew this quarter.')).toMatchObject({ title: 'Quarterly results', lines: ['Revenue grew this quarter.'] });
    expect(opening(deck).lines).toEqual([]);
  });
  it('skips tables without outer pipes', () => {
    expect(opening('# Results\nMeasure | Result\n--- | ---\nRevenue | 29800\nSummary').lines).toEqual(['Summary']);
  });
});

describe('sheet preview', () => {
  it('uses workbook currency, grouping, percentage and decimal formats', () => {
    const cells = [
      { text: '29800', number: 29800, format: '"£"#,##0' },
      { text: '29800', number: 29800, format: 3 },
      { text: '12.5%', number: 0.125, format: '0.00%' },
      { text: '4.2', number: 4.2, format: '0.000' },
      { text: 'Revenue', number: null, format: null },
    ];
    expect(sheetPreviewRows([cells])).toEqual([['£29,800', '29,800', '12.50%', '4.200', 'Revenue']]);
  });
});
