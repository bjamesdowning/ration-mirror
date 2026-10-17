CREATE TABLE `oauthClientAssertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauthClientResource` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `oauth_client_resource_client_id_idx` ON `oauthClientResource` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_client_resource_resource_id_idx` ON `oauthClientResource` (`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_resource_client_resource_uidx` ON `oauthClientResource` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE TABLE `oauthResource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthResource_identifier_unique` ON `oauthResource` (`identifier`);--> statement-breakpoint
ALTER TABLE `jwks` ADD `alg` text;--> statement-breakpoint
ALTER TABLE `jwks` ADD `crv` text;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `authorization_code_id` text;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `requested_user_info_claims` text;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `revoked` integer;--> statement-breakpoint
ALTER TABLE `oauthAccessToken` ADD `confirmation` text;--> statement-breakpoint
CREATE INDEX `oauth_access_token_authorization_code_id_idx` ON `oauthAccessToken` (`authorization_code_id`);--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `client_credentials_scopes` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `client_discovery_id` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `application_type` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `backchannel_logout_uri` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `backchannel_logout_session_required` integer;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `jwks` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `jwks_uri` text;--> statement-breakpoint
ALTER TABLE `oauthClient` ADD `dpop_bound_access_tokens` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `oauthConsent` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauthConsent` ADD `requested_user_info_claims` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `authorization_code_id` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `requested_user_info_claims` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `rotated_at` integer;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `rotation_replay_response` text;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `rotation_replay_expires_at` integer;--> statement-breakpoint
ALTER TABLE `oauthRefreshToken` ADD `confirmation` text;--> statement-breakpoint
CREATE INDEX `oauth_refresh_token_authorization_code_id_idx` ON `oauthRefreshToken` (`authorization_code_id`);