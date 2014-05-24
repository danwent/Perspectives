// new preference should be created in the "extensions.perspectives.x" namespace
// see https://developer.mozilla.org/en/Extensions/Extension_etiquette
// and https://github.com/danwent/Perspectives/issues/59
pref("perspectives.quorum_thresh"    ,   75);
pref("perspectives.required_duration",    0);
pref("extensions.perspectives.query_timeout_ms", 5000);
pref("extensions.perspectives.query_retries"   ,    2);
pref("perspectives.security_settings",    1);
pref("perspectives.exceptions.permanent", false);
pref("perspectives.exceptions.enabled", true);
pref("perspectives.check_good_certificates", true);
pref("perspectives.require_user_permission", false);
pref("extensions.perspectives.show_permission_reminder", true);
pref("extensions.perspectives.contact_in_private_browsing_mode", false);
pref("perspectives.show_label", true);
pref("perspectives.max_timespan_for_inconsistency_test", 7);
pref("perspectives.weak_consistency_time_limit", 30);
pref("perspectives.trust_https_with_weak_consistency", true);
pref("extensions.perspectives.max_cache_age_sec", 10000);
pref("perspectives.whitelist"                    , "");
pref("extensions.perspectives.whitelist_disabled", "");
pref("perspectives.prompt_update_all_https_setting", true);
pref("perspectives.additional_notary_list", "");
pref("perspectives.default_notary_list","");
pref("perspectives.use_default_notary_list",true);
pref("perspectives.enable_default_list_auto_update",false);
pref("perspectives.first_run", true);

