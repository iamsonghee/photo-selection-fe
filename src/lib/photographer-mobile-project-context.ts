export const PHOTOGRAPHER_MOBILE_PROJECT_CONTEXT_EVENT = "photographer:project-context-change";

export type PhotographerMobileProjectContext = {
  projectName: string;
  customerName: string;
};

export function readPhotographerMobileProjectContext(): PhotographerMobileProjectContext | null {
  if (typeof document === "undefined") return null;
  const { photographerProjectName, photographerProjectCustomer } = document.documentElement.dataset;
  if (!photographerProjectName || !photographerProjectCustomer) return null;
  return {
    projectName: photographerProjectName,
    customerName: photographerProjectCustomer,
  };
}

export function publishPhotographerMobileProjectContext(context: PhotographerMobileProjectContext | null) {
  if (typeof window === "undefined") return;
  if (context) {
    document.documentElement.dataset.photographerProjectName = context.projectName;
    document.documentElement.dataset.photographerProjectCustomer = context.customerName;
  } else {
    delete document.documentElement.dataset.photographerProjectName;
    delete document.documentElement.dataset.photographerProjectCustomer;
  }
  window.dispatchEvent(new CustomEvent(PHOTOGRAPHER_MOBILE_PROJECT_CONTEXT_EVENT));
}

export function clearPhotographerMobileProjectContext(context: PhotographerMobileProjectContext) {
  const current = readPhotographerMobileProjectContext();
  if (current?.projectName === context.projectName && current.customerName === context.customerName) {
    publishPhotographerMobileProjectContext(null);
  }
}
