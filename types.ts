
export interface HWPXData {
  applicant: string;
  ssn: string;
  address: string;
  servicePeriod: string;
  serviceContent: string;
  purpose: string;
  companyName: string;
  businessNo: string;
  companyAddress: string;
  representative: string;
  issueDate: string;
}

export interface ProcessingState {
  isUnzipping: boolean;
  isParsing: boolean;
  error: string | null;
}

export interface FileInfo {
  name: string;
  size: number;
  lastModified: number;
}

export interface PeriodSelection {
  year: string;
  startMonth: string;
  endMonth: string;
}
