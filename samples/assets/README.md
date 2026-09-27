# Sample CycloneDX Assets

This directory contains 50 synthetic CycloneDX JSON BOMs for Harmonia demos.
Each BOM represents one asset, and each `components[]` entry represents installed software with a CPE identifier.

The catalog models a realistic enterprise inventory: internet edge systems, core business apps, identity, CI/CD, databases, monitoring, collaboration, end-user laptops, and a few segmented operational systems.

## Regenerate

```bash
node samples/assets/generate-sample-assets.mjs
```

## Files

| File | Scenario | Asset metrics | Components |
|------|----------|---------------|------------|
| `web-gateway-prod-01.cyclonedx.json` | Internet-facing reverse proxy / web gateway | internet, high, high | 4 |
| `erp-app-prod-01.cyclonedx.json` | Internal critical Java ERP stack | internal, critical, high | 5 |
| `dev-workstation-42.cyclonedx.json` | Developer workstation with browser and desktop software | internet, medium, low | 8 |
| `legacy-vpn-dmz-01.cyclonedx.json` | Exposed legacy VPN / edge appliance | internet, critical, high | 4 |
| `api-gateway-prod-01.cyclonedx.json` | Public API gateway for customer and partner integrations | internet, critical, high | 5 |
| `waf-edge-prod-01.cyclonedx.json` | Public WAF / load-balancer in front of business applications | internet, critical, high | 2 |
| `mail-gateway-prod-01.cyclonedx.json` | Inbound mail security gateway | internet, high, medium | 4 |
| `customer-portal-prod-01.cyclonedx.json` | Customer self-service portal | internet, critical, high | 5 |
| `marketing-cms-prod-01.cyclonedx.json` | Public marketing CMS | internet, medium, medium | 5 |
| `partner-sftp-prod-01.cyclonedx.json` | Partner SFTP drop zone exposed through the DMZ | internet, high, medium | 3 |
| `bastion-admin-prod-01.cyclonedx.json` | Internet-reachable administrative bastion with MFA | internet, critical, high | 5 |
| `firewall-edge-fw-01.cyclonedx.json` | Perimeter firewall for headquarters and DMZ networks | internet, critical, high | 1 |
| `vpn-remote-prod-02.cyclonedx.json` | Remote-access VPN concentrator for employees and contractors | internet, critical, high | 2 |
| `iam-keycloak-prod-01.cyclonedx.json` | Central identity provider for internal and customer applications | internal, critical, high | 5 |
| `ad-domain-controller-01.cyclonedx.json` | Primary Active Directory domain controller | internal, critical, high | 1 |
| `ad-domain-controller-02.cyclonedx.json` | Secondary Active Directory domain controller | internal, critical, high | 1 |
| `exchange-mailbox-prod-01.cyclonedx.json` | Internal Exchange mailbox server | internal, critical, high | 2 |
| `sharepoint-intranet-prod-01.cyclonedx.json` | SharePoint intranet and document collaboration | internal, high, high | 3 |
| `jira-prod-01.cyclonedx.json` | Engineering project tracking | internal, high, medium | 5 |
| `confluence-prod-01.cyclonedx.json` | Internal knowledge base and runbooks | internal, medium, medium | 5 |
| `gitlab-prod-01.cyclonedx.json` | Source code management and merge request platform | internal, critical, high | 6 |
| `jenkins-ci-prod-01.cyclonedx.json` | Build automation for production releases | internal, critical, high | 6 |
| `registry-container-prod-01.cyclonedx.json` | Private container image registry | internal, high, medium | 4 |
| `k8s-control-prod-01.cyclonedx.json` | Production Kubernetes control-plane node | internal, critical, high | 4 |
| `k8s-worker-prod-03.cyclonedx.json` | Production Kubernetes worker node for business workloads | internal, high, medium | 4 |
| `postgres-core-prod-01.cyclonedx.json` | Core transactional PostgreSQL database | internal, critical, high | 4 |
| `mysql-reporting-prod-01.cyclonedx.json` | Reporting MySQL database for BI extracts | internal, high, medium | 3 |
| `mssql-finance-prod-01.cyclonedx.json` | Finance SQL Server database | internal, critical, high | 2 |
| `oracle-erp-db-prod-01.cyclonedx.json` | Oracle database backing ERP workloads | internal, critical, high | 3 |
| `rabbitmq-prod-01.cyclonedx.json` | Message broker for asynchronous order processing | internal, high, medium | 3 |
| `kafka-prod-01.cyclonedx.json` | Event streaming platform for telemetry and integrations | internal, high, medium | 3 |
| `elastic-logs-prod-01.cyclonedx.json` | Central log search cluster node | internal, high, medium | 4 |
| `grafana-monitoring-prod-01.cyclonedx.json` | Operational monitoring dashboards | internal, medium, low | 4 |
| `splunk-siem-prod-01.cyclonedx.json` | Security event management platform | internal, critical, high | 3 |
| `backup-veeam-prod-01.cyclonedx.json` | Central backup and recovery server | internal, critical, high | 2 |
| `fileserver-corp-01.cyclonedx.json` | Corporate file server for shared departments | internal, high, medium | 2 |
| `print-server-hq-01.cyclonedx.json` | Headquarters print server | internal, low, medium | 2 |
| `vcenter-prod-01.cyclonedx.json` | Virtualization management plane | internal, critical, high | 2 |
| `ansible-control-prod-01.cyclonedx.json` | Configuration management control node | internal, high, medium | 5 |
| `finance-laptop-17.cyclonedx.json` | Finance laptop with office, browser, PDF, and collaboration tools | internet, high, low | 7 |
| `executive-laptop-03.cyclonedx.json` | Executive laptop with high-value mailbox and document access | internet, critical, low | 8 |
| `sales-laptop-28.cyclonedx.json` | Sales laptop used from hotels and customer sites | internet, medium, low | 8 |
| `support-workstation-12.cyclonedx.json` | Support workstation with admin tools and remote troubleshooting clients | internet, high, medium | 8 |
| `dev-laptop-windows-07.cyclonedx.json` | Windows developer laptop with local containers and project tooling | internet, medium, low | 9 |
| `dev-laptop-linux-11.cyclonedx.json` | Linux developer laptop with local Kubernetes tooling | internet, medium, low | 9 |
| `macbook-design-04.cyclonedx.json` | Design team MacBook with browser, collaboration, and office tooling | internet, medium, low | 7 |
| `callcenter-desktop-33.cyclonedx.json` | Call-center desktop with browser-based CRM access | internal, medium, low | 5 |
| `warehouse-scanner-mdm-01.cyclonedx.json` | MDM-managed Android scanners for warehouse operations | internal, medium, medium | 2 |
| `camera-nvr-warehouse-01.cyclonedx.json` | Warehouse network video recorder on a segmented network | isolated, medium, high | 3 |
| `building-bms-hq-01.cyclonedx.json` | Building management server for HVAC and access schedules | isolated, high, high | 3 |

## Usage

Open the Harmonia frontend, go to `Assets`, and import these files one by one.
After importing, run asset scoring, finding matching, and finding scoring from the dashboard.

These assets intentionally use well-known CPEs that are likely to match a populated NVD dataset.
CPE identifiers can be checked against the NVD CPE Dictionary or Products API, but dictionary membership is not ground truth for product identity or applicability.


## Scope and canonical direction

These fixtures exercise the **current experimental CPE matcher**, not a complete applicability engine. They are not an annotated gold dataset: finding counts depend on the vulnerability data ingested, and an apparent match can require additional version/environment evidence. Reimporting an asset replaces its components and can cascade-delete their findings and scores; rerunning matching does not preserve the old finding history.

The target product model gives software an internal **Product identity independent of CPE**. Official bindings and derived CPE names are separate, optional evidence. Software without a CPE must remain representable. Preserve this catalog and generator as a Lab baseline; add explicit labeled corpora for new resolvers rather than treating the existing BOMs as proof of accuracy.

See the [product roadmap](../../ROADMAP.md), [Product/CPE resolution](../../docs/RESOLUTION.md) and [Research Lab evaluation](../../docs/EVALUATION.md).
