import { describe, expect, it } from 'vitest';
import { parseCSV } from './csv';

describe('parseCSV', () => {
  it('parses simple CSV rows', () => {
    expect(parseCSV('name,emp_code\nAlice,STPL1001\nBob,STPL1002')).toEqual([
      { name: 'Alice', emp_code: 'STPL1001' },
      { name: 'Bob', emp_code: 'STPL1002' },
    ]);
  });

  it('parses quoted commas and escaped quotes', () => {
    expect(parseCSV('name,job_title\n"Doe, Jane","Senior ""Support"" Engineer"')).toEqual([
      { name: 'Doe, Jane', job_title: 'Senior "Support" Engineer' },
    ]);
  });

  it('handles CRLF files and trailing blank lines', () => {
    expect(parseCSV('name,emp_code\r\nAlice,STPL1001\r\n\r\n')).toEqual([
      { name: 'Alice', emp_code: 'STPL1001' },
    ]);
  });

  it('preserves empty cells used by roster templates', () => {
    expect(parseCSV('emp_code,1,2,3\nSTPL1001,GS,,WO')).toEqual([
      { emp_code: 'STPL1001', '1': 'GS', '2': '', '3': 'WO' },
    ]);
  });
});
