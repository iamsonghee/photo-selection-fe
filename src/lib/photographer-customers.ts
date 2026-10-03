import type { ProjectStatus } from "@/types";

export type CustomerSummary = {
  id: string;
  name: string;
  phone: string | null;
  projectCount: number;
  activeProjectCount: number;
  latestShootDate: string | null;
  firstShootDate: string | null;
};
export type CustomerHistoryProject = {
  id: string;
  name: string;
  shootDate: string;
  shootType: string | null;
  location: string | null;
  status: ProjectStatus;
  photoCount: number;
  thumbnailUrl: string | null;
};
export type PhotographerCustomer = {
  id: string;
  name: string;
  phone: string | null;
  note: string;
  updatedAt: string;
};
export type CustomerDetail = PhotographerCustomer & { projects: CustomerHistoryProject[] };
export const CUSTOMER_NAME_MAX_LENGTH = 100;
export const CUSTOMER_NOTE_MAX_LENGTH = 2000;
export const CUSTOMER_PAGE_SIZE = 50;
export const isCustomerId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
