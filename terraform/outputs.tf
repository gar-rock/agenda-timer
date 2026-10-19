output "site_url" {
  description = "Public HTTPS URL for the mock site."
  value       = "https://${local.fqdn}"
}

output "fqdn" {
  description = "Fully-qualified domain name configured for the site."
  value       = local.fqdn
}

