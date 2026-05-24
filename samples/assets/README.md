# Sample CycloneDX Assets

This directory contains synthetic CycloneDX JSON BOMs for VulnPrio demos.
Each BOM represents one asset, and each `components[]` entry represents installed software with a CPE identifier.

## Files

| File | Scenario | Asset metrics |
|------|----------|---------------|
| `web-gateway-prod-01.cyclonedx.json` | Internet-facing reverse proxy / web gateway | internet, high, high |
| `erp-app-prod-01.cyclonedx.json` | Internal critical Java ERP stack | internal, critical, high |
| `dev-workstation-42.cyclonedx.json` | Developer workstation with browser and desktop software | internal, medium, low |
| `legacy-vpn-dmz-01.cyclonedx.json` | Exposed legacy VPN / edge appliance | internet, critical, high |

## Usage

Open the VulnPrio frontend, go to `Assets`, and import these files one by one.
After importing, run finding matching and finding scoring from the `Findings` tab.

These assets intentionally use well-known CPEs that are likely to match a populated NVD dataset.
For a real CPE source, use the official NVD CPE Dictionary or the NVD Products API.

