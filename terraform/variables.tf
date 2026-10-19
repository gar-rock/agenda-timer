variable "aws_region" {
  description = "AWS region used for the S3 bucket and most resources. CloudFront/ACM still use us-east-1."
  type        = string
  default     = "us-east-1"
}

variable "subdomain" {
  description = "Subdomain label (the part before the root domain). For example, `demo` produces `demo.postmeld.com`."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.subdomain))
    error_message = "subdomain must be a valid DNS label: lowercase letters, digits and hyphens, 1-63 chars, not starting or ending with a hyphen."
  }
}

variable "root_domain" {
  description = "Root domain managed in Route53 that the subdomain is attached to."
  type        = string
  default     = "postmeld.com"
}

variable "site_content_dir" {
  description = "Path to the directory whose contents are uploaded to the bucket."
  type        = string
  default     = "../site"
}

variable "tags" {
  description = "Default tags applied to all created resources."
  type        = map(string)
  default = {
    Project   = "mock-static-website"
    ManagedBy = "terraform"
  }
}
