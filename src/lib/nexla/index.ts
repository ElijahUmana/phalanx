// Nexla Express data pipeline integration — Task #10
// Ingests live CVE feeds (NVD, GHSA, OSV), writes remediation artifacts back
// to customer systems (Slack, Jira, ServiceNow, PagerDuty), and proves
// dynamic source discovery.

export * from './types';
export * from './ingestion';
export * from './writeback';
export * from './discovery';
