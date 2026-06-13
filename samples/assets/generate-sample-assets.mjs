import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = dirname(fileURLToPath(import.meta.url));

const os = {
  ubuntu2004: component("operating-system", "Canonical", "Ubuntu Linux", "20.04", "canonical", "ubuntu_linux", "o"),
  ubuntu2204: component("operating-system", "Canonical", "Ubuntu Linux", "22.04", "canonical", "ubuntu_linux", "o"),
  debian11: component("operating-system", "Debian", "Debian Linux", "11", "debian", "debian_linux", "o"),
  debian12: component("operating-system", "Debian", "Debian Linux", "12", "debian", "debian_linux", "o"),
  rhel8: component("operating-system", "Red Hat", "Red Hat Enterprise Linux", "8", "redhat", "enterprise_linux", "o"),
  rhel9: component("operating-system", "Red Hat", "Red Hat Enterprise Linux", "9", "redhat", "enterprise_linux", "o"),
  windows10: component("operating-system", "Microsoft", "Microsoft Windows 10", "22H2", "microsoft", "windows_10", "o"),
  windows11: component("operating-system", "Microsoft", "Microsoft Windows 11", "23H2", "microsoft", "windows_11", "o"),
  windowsServer2016: component("operating-system", "Microsoft", "Microsoft Windows Server 2016", "1607", "microsoft", "windows_server_2016", "o"),
  windowsServer2019: component("operating-system", "Microsoft", "Microsoft Windows Server 2019", "1809", "microsoft", "windows_server_2019", "o"),
  windowsServer2022: component("operating-system", "Microsoft", "Microsoft Windows Server 2022", "21H2", "microsoft", "windows_server_2022", "o"),
  esxi: component("operating-system", "VMware", "VMware ESXi", "7.0", "vmware", "esxi", "o"),
  macos: component("operating-system", "Apple", "macOS", "13.6", "apple", "macos", "o"),
  ios: component("operating-system", "Apple", "iOS", "16.6", "apple", "iphone_os", "o"),
  android: component("operating-system", "Google", "Android", "12", "google", "android", "o"),
};

const sw = {
  apache249: component("application", "Apache Software Foundation", "Apache HTTP Server", "2.4.49", "apache", "http_server"),
  apache254: component("application", "Apache Software Foundation", "Apache HTTP Server", "2.4.54", "apache", "http_server"),
  nginx114: component("application", "nginx", "nginx", "1.14.0", "nginx", "nginx"),
  nginx122: component("application", "nginx", "nginx", "1.22.1", "nginx", "nginx"),
  openssl101: component("library", "OpenSSL", "OpenSSL", "1.0.1", "openssl", "openssl"),
  openssl111: component("library", "OpenSSL", "OpenSSL", "1.1.1", "openssl", "openssl"),
  openssh82: component("application", "OpenBSD", "OpenSSH", "8.2", "openbsd", "openssh"),
  openssh84: component("application", "OpenBSD", "OpenSSH", "8.4", "openbsd", "openssh"),
  tomcat85: component("application", "Apache Software Foundation", "Apache Tomcat", "8.5.81", "apache", "tomcat"),
  tomcat9: component("application", "Apache Software Foundation", "Apache Tomcat", "9.0.65", "apache", "tomcat"),
  java8: component("application", "Oracle", "Oracle Java SE", "8u202", "oracle", "jre"),
  java11: component("application", "Oracle", "Oracle Java SE", "11.0.16", "oracle", "jdk"),
  node16: component("application", "OpenJS Foundation", "Node.js", "16.17.0", "nodejs", "node.js"),
  python39: component("application", "Python Software Foundation", "Python", "3.9.13", "python", "python"),
  postgres13: component("application", "PostgreSQL", "PostgreSQL", "13.7", "postgresql", "postgresql"),
  postgres14: component("application", "PostgreSQL", "PostgreSQL", "14.5", "postgresql", "postgresql"),
  mysql80: component("application", "Oracle", "MySQL", "8.0.30", "oracle", "mysql"),
  mariadb105: component("application", "MariaDB", "MariaDB", "10.5.16", "mariadb", "mariadb"),
  sqlServer2019: component("application", "Microsoft", "Microsoft SQL Server", "2019", "microsoft", "sql_server"),
  oracle19c: component("application", "Oracle", "Oracle Database Server", "19c", "oracle", "database_server"),
  redis62: component("application", "Redis", "Redis", "6.2.7", "redis", "redis"),
  rabbitmq38: component("application", "VMware", "RabbitMQ", "3.8.30", "vmware", "rabbitmq"),
  kafka31: component("application", "Apache Software Foundation", "Apache Kafka", "3.1.0", "apache", "kafka"),
  elastic717: component("application", "Elastic", "Elasticsearch", "7.17.4", "elastic", "elasticsearch"),
  kibana717: component("application", "Elastic", "Kibana", "7.17.4", "elastic", "kibana"),
  grafana89: component("application", "Grafana Labs", "Grafana", "8.5.9", "grafana", "grafana"),
  prometheus240: component("application", "Prometheus", "Prometheus", "2.40.0", "prometheus", "prometheus"),
  git230: component("application", "Git Project", "Git", "2.30.0", "git-scm", "git"),
  git240: component("application", "Git Project", "Git", "2.40.0", "git-scm", "git"),
  gitlab151: component("application", "GitLab", "GitLab", "15.1.0", "gitlab", "gitlab"),
  jenkins249: component("application", "Jenkins", "Jenkins", "2.249.1", "jenkins", "jenkins"),
  docker2010: component("application", "Docker", "Docker Engine", "20.10.17", "docker", "docker"),
  dockerDesktop: component("application", "Docker", "Docker Desktop", "4.12.0", "docker", "docker_desktop"),
  kubernetes124: component("application", "Kubernetes", "Kubernetes", "1.24.4", "kubernetes", "kubernetes"),
  helm: component("application", "Helm", "Helm", "3.9.4", "helm", "helm"),
  terraform: component("application", "HashiCorp", "Terraform", "1.3.0", "hashicorp", "terraform"),
  ansible: component("application", "Red Hat", "Ansible", "2.9.27", "redhat", "ansible"),
  jira: component("application", "Atlassian", "Jira", "8.20.10", "atlassian", "jira"),
  confluence: component("application", "Atlassian", "Confluence", "7.18.1", "atlassian", "confluence"),
  keycloak: component("application", "Red Hat", "Keycloak", "19.0.1", "redhat", "keycloak"),
  nextcloud: component("application", "Nextcloud", "Nextcloud Server", "24.0.4", "nextcloud", "nextcloud_server"),
  wordpress: component("application", "WordPress", "WordPress", "5.8.3", "wordpress", "wordpress"),
  drupal: component("application", "Drupal", "Drupal", "9.3.9", "drupal", "drupal"),
  exchange2019: component("application", "Microsoft", "Microsoft Exchange Server", "2019", "microsoft", "exchange_server"),
  sharepoint2019: component("application", "Microsoft", "Microsoft SharePoint Server", "2019", "microsoft", "sharepoint_server"),
  chrome91: component("application", "Google", "Google Chrome", "91.0.4472.77", "google", "chrome"),
  chrome120: component("application", "Google", "Google Chrome", "120.0.6099.109", "google", "chrome"),
  firefox102: component("application", "Mozilla", "Mozilla Firefox", "102.0", "mozilla", "firefox"),
  edge120: component("application", "Microsoft", "Microsoft Edge", "120.0.2210.61", "microsoft", "edge"),
  office2019: component("application", "Microsoft", "Microsoft Office", "2019", "microsoft", "office"),
  teams: component("application", "Microsoft", "Microsoft Teams", "1.6.00", "microsoft", "teams"),
  zoom: component("application", "Zoom", "Zoom Client", "5.12.2", "zoom", "zoom"),
  vscode: component("application", "Microsoft", "Visual Studio Code", "1.72.0", "microsoft", "visual_studio_code"),
  intellij: component("application", "JetBrains", "IntelliJ IDEA", "2022.2", "jetbrains", "intellij_idea"),
  libreoffice: component("application", "The Document Foundation", "LibreOffice", "7.3.6", "libreoffice", "libreoffice"),
  acrobat: component("application", "Adobe", "Adobe Acrobat Reader DC", "22.003.20258", "adobe", "acrobat_reader_dc"),
  sevenZip: component("application", "Igor Pavlov", "7-Zip", "19.00", "7-zip", "7-zip"),
  filezilla: component("application", "FileZilla", "FileZilla Client", "3.60.1", "filezilla-project", "filezilla_client"),
  putty: component("application", "PuTTY", "PuTTY", "0.76", "putty", "putty"),
  wireshark: component("application", "Wireshark", "Wireshark", "3.6.8", "wireshark", "wireshark"),
  vcenter: component("application", "VMware", "VMware vCenter Server", "7.0", "vmware", "vcenter_server"),
  veeam: component("application", "Veeam", "Veeam Backup & Replication", "11.0", "veeam", "backup_&_replication"),
  samba: component("application", "Samba", "Samba", "4.15.5", "samba", "samba"),
  cups: component("application", "OpenPrinting", "CUPS", "2.4.2", "cups", "cups"),
  zabbix: component("application", "Zabbix", "Zabbix", "6.0.4", "zabbix", "zabbix"),
  splunk: component("application", "Splunk", "Splunk Enterprise", "8.2.6", "splunk", "splunk"),
  fortios: component("operating-system", "Fortinet", "FortiOS", "7.0.5", "fortinet", "fortios", "o"),
  f5BigIp: component("application", "F5", "BIG-IP", "16.1.2", "f5", "big-ip"),
  paloAltoPanOs: component("operating-system", "Palo Alto Networks", "PAN-OS", "10.1.6", "paloaltonetworks", "pan-os", "o"),
  openvpn: component("application", "OpenVPN", "OpenVPN", "2.5.7", "openvpn", "openvpn"),
  pfSense: component("operating-system", "Netgate", "pfSense", "2.6.0", "netgate", "pfsense", "o"),
};

const officeBase = [sw.chrome120, sw.edge120, sw.office2019, sw.teams, sw.acrobat, sw.sevenZip];
const devWindowsBase = [os.windows11, sw.chrome120, sw.vscode, sw.git240, sw.dockerDesktop, sw.node16, sw.python39, sw.terraform, sw.teams];
const devLinuxBase = [os.ubuntu2204, sw.firefox102, sw.vscode, sw.git240, sw.docker2010, sw.node16, sw.python39, sw.kubernetes124, sw.terraform];

const assets = [
  asset("web-gateway-prod-01", "application", "Internet-facing reverse proxy / web gateway", "internet", "high", "high", [
    sw.apache249, sw.nginx114, sw.openssl101, os.ubuntu2004,
  ]),
  asset("erp-app-prod-01", "application", "Internal critical Java ERP stack", "internal", "critical", "high", [
    os.rhel8, sw.tomcat85, sw.java8, sw.oracle19c, sw.openssl111,
  ]),
  asset("dev-workstation-42", "device", "Developer workstation with browser and desktop software", "internet", "medium", "low", [
    os.windows10, sw.chrome91, sw.sevenZip, sw.git230, sw.vscode, sw.dockerDesktop, sw.node16, sw.python39,
  ]),
  asset("legacy-vpn-dmz-01", "device", "Exposed legacy VPN / edge appliance", "internet", "critical", "high", [
    os.debian11, sw.openvpn, sw.openssl101, sw.openssh82,
  ]),
  asset("api-gateway-prod-01", "application", "Public API gateway for customer and partner integrations", "internet", "critical", "high", [
    os.ubuntu2204, sw.nginx122, sw.node16, sw.openssl111, sw.redis62,
  ]),
  asset("waf-edge-prod-01", "device", "Public WAF / load-balancer in front of business applications", "internet", "critical", "high", [
    sw.f5BigIp, sw.openssl111,
  ]),
  asset("mail-gateway-prod-01", "application", "Inbound mail security gateway", "internet", "high", "medium", [
    os.ubuntu2004, sw.nginx122, sw.openssl111, sw.python39,
  ]),
  asset("customer-portal-prod-01", "application", "Customer self-service portal", "internet", "critical", "high", [
    os.ubuntu2204, sw.nginx122, sw.tomcat9, sw.java11, sw.postgres14,
  ]),
  asset("marketing-cms-prod-01", "application", "Public marketing CMS", "internet", "medium", "medium", [
    os.ubuntu2004, sw.apache254, sw.wordpress, sw.mysql80, sw.openssl111,
  ]),
  asset("partner-sftp-prod-01", "application", "Partner SFTP drop zone exposed through the DMZ", "internet", "high", "medium", [
    os.rhel8, sw.openssh84, sw.openssl111,
  ]),
  asset("bastion-admin-prod-01", "device", "Internet-reachable administrative bastion with MFA", "internet", "critical", "high", [
    os.ubuntu2204, sw.openssh84, sw.openvpn, sw.terraform, sw.ansible,
  ]),
  asset("firewall-edge-fw-01", "device", "Perimeter firewall for headquarters and DMZ networks", "internet", "critical", "high", [
    sw.fortios,
  ]),
  asset("vpn-remote-prod-02", "device", "Remote-access VPN concentrator for employees and contractors", "internet", "critical", "high", [
    sw.paloAltoPanOs, sw.openssl111,
  ]),
  asset("iam-keycloak-prod-01", "application", "Central identity provider for internal and customer applications", "internal", "critical", "high", [
    os.rhel8, sw.keycloak, sw.java11, sw.postgres14, sw.nginx122,
  ]),
  asset("ad-domain-controller-01", "device", "Primary Active Directory domain controller", "internal", "critical", "high", [
    os.windowsServer2019,
  ]),
  asset("ad-domain-controller-02", "device", "Secondary Active Directory domain controller", "internal", "critical", "high", [
    os.windowsServer2022,
  ]),
  asset("exchange-mailbox-prod-01", "application", "Internal Exchange mailbox server", "internal", "critical", "high", [
    os.windowsServer2019, sw.exchange2019,
  ]),
  asset("sharepoint-intranet-prod-01", "application", "SharePoint intranet and document collaboration", "internal", "high", "high", [
    os.windowsServer2019, sw.sharepoint2019, sw.sqlServer2019,
  ]),
  asset("jira-prod-01", "application", "Engineering project tracking", "internal", "high", "medium", [
    os.ubuntu2004, sw.jira, sw.java11, sw.postgres13, sw.nginx122,
  ]),
  asset("confluence-prod-01", "application", "Internal knowledge base and runbooks", "internal", "medium", "medium", [
    os.ubuntu2004, sw.confluence, sw.java11, sw.postgres13, sw.nginx122,
  ]),
  asset("gitlab-prod-01", "application", "Source code management and merge request platform", "internal", "critical", "high", [
    os.ubuntu2204, sw.gitlab151, sw.postgres14, sw.redis62, sw.nginx122, sw.git240,
  ]),
  asset("jenkins-ci-prod-01", "application", "Build automation for production releases", "internal", "critical", "high", [
    os.ubuntu2204, sw.jenkins249, sw.java11, sw.docker2010, sw.git240, sw.node16,
  ]),
  asset("registry-container-prod-01", "application", "Private container image registry", "internal", "high", "medium", [
    os.ubuntu2204, sw.docker2010, sw.nginx122, sw.openssl111,
  ]),
  asset("k8s-control-prod-01", "device", "Production Kubernetes control-plane node", "internal", "critical", "high", [
    os.ubuntu2204, sw.kubernetes124, sw.docker2010, sw.openssl111,
  ]),
  asset("k8s-worker-prod-03", "device", "Production Kubernetes worker node for business workloads", "internal", "high", "medium", [
    os.ubuntu2204, sw.kubernetes124, sw.docker2010, sw.openssl111,
  ]),
  asset("postgres-core-prod-01", "database", "Core transactional PostgreSQL database", "internal", "critical", "high", [
    os.rhel8, sw.postgres13, sw.openssl111, sw.openssh84,
  ]),
  asset("mysql-reporting-prod-01", "database", "Reporting MySQL database for BI extracts", "internal", "high", "medium", [
    os.ubuntu2004, sw.mysql80, sw.openssl111,
  ]),
  asset("mssql-finance-prod-01", "database", "Finance SQL Server database", "internal", "critical", "high", [
    os.windowsServer2019, sw.sqlServer2019,
  ]),
  asset("oracle-erp-db-prod-01", "database", "Oracle database backing ERP workloads", "internal", "critical", "high", [
    os.rhel8, sw.oracle19c, sw.openssl111,
  ]),
  asset("rabbitmq-prod-01", "application", "Message broker for asynchronous order processing", "internal", "high", "medium", [
    os.debian11, sw.rabbitmq38, sw.openssl111,
  ]),
  asset("kafka-prod-01", "application", "Event streaming platform for telemetry and integrations", "internal", "high", "medium", [
    os.rhel8, sw.kafka31, sw.java11,
  ]),
  asset("elastic-logs-prod-01", "application", "Central log search cluster node", "internal", "high", "medium", [
    os.ubuntu2204, sw.elastic717, sw.kibana717, sw.java11,
  ]),
  asset("grafana-monitoring-prod-01", "application", "Operational monitoring dashboards", "internal", "medium", "low", [
    os.ubuntu2204, sw.grafana89, sw.prometheus240, sw.nginx122,
  ]),
  asset("splunk-siem-prod-01", "application", "Security event management platform", "internal", "critical", "high", [
    os.rhel8, sw.splunk, sw.openssl111,
  ]),
  asset("backup-veeam-prod-01", "application", "Central backup and recovery server", "internal", "critical", "high", [
    os.windowsServer2019, sw.veeam,
  ]),
  asset("fileserver-corp-01", "device", "Corporate file server for shared departments", "internal", "high", "medium", [
    os.windowsServer2019, sw.samba,
  ]),
  asset("print-server-hq-01", "device", "Headquarters print server", "internal", "low", "medium", [
    os.windowsServer2016, sw.cups,
  ]),
  asset("vcenter-prod-01", "application", "Virtualization management plane", "internal", "critical", "high", [
    sw.vcenter, os.esxi,
  ]),
  asset("ansible-control-prod-01", "application", "Configuration management control node", "internal", "high", "medium", [
    os.rhel9, sw.ansible, sw.python39, sw.git240, sw.openssh84,
  ]),
  asset("finance-laptop-17", "device", "Finance laptop with office, browser, PDF, and collaboration tools", "internet", "high", "low", [
    os.windows11, ...officeBase,
  ]),
  asset("executive-laptop-03", "device", "Executive laptop with high-value mailbox and document access", "internet", "critical", "low", [
    os.windows11, ...officeBase, sw.zoom,
  ]),
  asset("sales-laptop-28", "device", "Sales laptop used from hotels and customer sites", "internet", "medium", "low", [
    os.windows11, ...officeBase, sw.zoom,
  ]),
  asset("support-workstation-12", "device", "Support workstation with admin tools and remote troubleshooting clients", "internet", "high", "medium", [
    os.windows10, sw.chrome120, sw.edge120, sw.office2019, sw.teams, sw.putty, sw.filezilla, sw.wireshark,
  ]),
  asset("dev-laptop-windows-07", "device", "Windows developer laptop with local containers and project tooling", "internet", "medium", "low", devWindowsBase),
  asset("dev-laptop-linux-11", "device", "Linux developer laptop with local Kubernetes tooling", "internet", "medium", "low", devLinuxBase),
  asset("macbook-design-04", "device", "Design team MacBook with browser, collaboration, and office tooling", "internet", "medium", "low", [
    os.macos, sw.chrome120, sw.firefox102, sw.office2019, sw.teams, sw.zoom, sw.acrobat,
  ]),
  asset("callcenter-desktop-33", "device", "Call-center desktop with browser-based CRM access", "internal", "medium", "low", [
    os.windows10, sw.chrome120, sw.edge120, sw.office2019, sw.teams,
  ]),
  asset("warehouse-scanner-mdm-01", "device", "MDM-managed Android scanners for warehouse operations", "internal", "medium", "medium", [
    os.android, sw.chrome120,
  ]),
  asset("camera-nvr-warehouse-01", "device", "Warehouse network video recorder on a segmented network", "isolated", "medium", "high", [
    os.debian11, sw.nginx114, sw.openssl101,
  ]),
  asset("building-bms-hq-01", "device", "Building management server for HVAC and access schedules", "isolated", "high", "high", [
    os.windowsServer2016, sw.apache249, sw.openssl101,
  ]),
];

mkdirSync(outDir, { recursive: true });

for (const spec of assets) {
  writeFileSync(join(outDir, `${spec.name}.cyclonedx.json`), `${JSON.stringify(toBom(spec), null, 2)}\n`);
}

writeFileSync(join(outDir, "README.md"), readme());

console.log(`Generated ${assets.length} CycloneDX asset samples in ${outDir}`);

function component(type, publisher, name, version, vendor, product, part = "a") {
  const slug = `${publisher}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    type,
    publisher,
    name,
    version,
    purl: `pkg:generic/${slug}@${version}`,
    cpe: `cpe:2.3:${part}:${vendor}:${product}:${version}:*:*:*:*:*:*:*`,
  };
}

function asset(name, type, scenario, internetExposure, businessCriticality, patchComplexity, components) {
  return {
    name,
    type,
    scenario,
    internetExposure,
    businessCriticality,
    patchComplexity,
    components,
  };
}

function toBom(spec) {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    serialNumber: `urn:uuid:${stableUuid(spec.name)}`,
    metadata: {
      timestamp: "2026-05-23T09:00:00Z",
      component: {
        type: spec.type,
        "bom-ref": `asset:${spec.name}`,
        name: spec.name,
        version: "2026.05",
        properties: [
          { name: "vulnprio:scenario", value: spec.scenario },
          { name: "vulnprio:internet_exposure", value: spec.internetExposure },
          { name: "vulnprio:business_criticality", value: spec.businessCriticality },
          { name: "vulnprio:patch_complexity", value: spec.patchComplexity },
        ],
      },
    },
    components: spec.components.map((item) => ({
      type: item.type,
      "bom-ref": item.purl,
      name: item.name,
      version: item.version,
      publisher: item.publisher,
      purl: item.purl,
      cpe: item.cpe,
    })),
  };
}

function stableUuid(value) {
  const hash = createHash("sha1").update(`vulnprio:${value}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function readme() {
  const rows = assets
    .map((spec) => {
      const file = `${spec.name}.cyclonedx.json`;
      const metrics = `${spec.internetExposure}, ${spec.businessCriticality}, ${spec.patchComplexity}`;
      return `| \`${file}\` | ${spec.scenario} | ${metrics} | ${spec.components.length} |`;
    })
    .join("\n");
  const files = readdirSync(outDir).filter((name) => name.endsWith(".cyclonedx.json"));
  const staleNote = files.length > assets.length
    ? "\n\nIf a sample file is removed from this generator, delete the stale JSON file manually before regenerating.\n"
    : "";

  return `# Sample CycloneDX Assets

This directory contains synthetic CycloneDX JSON BOMs for VulnPrio demos.
Each BOM represents one asset, and each \`components[]\` entry represents installed software with a CPE identifier.

The catalog models a realistic enterprise inventory: internet edge systems, core business apps, identity, CI/CD, databases, monitoring, collaboration, end-user laptops, and a few segmented operational systems.

## Regenerate

\`\`\`bash
node samples/assets/generate-sample-assets.mjs
\`\`\`

## Files

| File | Scenario | Asset metrics | Components |
|------|----------|---------------|------------|
${rows}

## Usage

Open the VulnPrio frontend, go to \`Assets\`, and import these files one by one.
After importing, run asset scoring, finding matching, and finding scoring from the dashboard.

These assets intentionally use well-known CPEs that are likely to match a populated NVD dataset.
For a real CPE source, use the official NVD CPE Dictionary or the NVD Products API.
${staleNote}`;
}
