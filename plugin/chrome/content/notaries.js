/*
*   This file is part of the Perspectives Firefox Client
*
*   Copyright (C) 2011 Dan Wendlandt
*
*   This program is free software: you can redistribute it and/or modify
*   it under the terms of the GNU General Public License as published by
*   the Free Software Foundation, version 3 of the License.
*
*   This program is distributed in the hope that it will be useful,
*   but WITHOUT ANY WARRANTY; without even the implied warranty of
*   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*   GNU General Public License for more details.
*
*   You should have received a copy of the GNU General Public License
*   along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

//NOTE: Firefox pre-defines Cc and Ci, but SeaMonkey does not.
//We create local variables here so SeaMonkey clients don't throw 'variable is not defined' exceptions
var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var Perspectives = {
	MY_ID: "perspectives@cmu.edu",
	strbundle: null, // this isn't loaded when things are initialized

	// IP addresses that can't be queried by notary machines
	// (unless the notary is specifically set up on a private network)
	// so don't ask about them.
	// FIXME: these regexes should be less generous
	nonrouted_ips: [/^192\.168\./, /^10\./, /^172\.1[6-9]\./,
		/^172\.2[0-9]\./, /^172\.3[0-1]\./, /^169\.254\./,
		/^127\.0\.0\.1$/], // could add many more

	// list of objects representing each notary server's name + port and public
	// key this list is populated by fillNotaryList() based on a file shipped with the
	// extension
	all_notaries: [],

	// Data

	// See init_data().
	// Always call init_data() before working with these variables!
	root_prefs: null,
	overrideService: null,

	/*
	 Note: calls to Cc.getService() require special permissions.
	 If we set the value of data properties at object creation time,
	 (i.e. as part of the variable definition statements, above)
	 anything that doesn't have permission, such as an HTML file including
	 notaries.js as a script, will fail and not be able to use this object.
	 Thus, we initialize data properties inside a function instead,
	 so the caller can have control over when that happens
	 and ask for permission beforehand if necessary.
	 This helps to ensure Perspectives can be properly parsed and used
	 in many situations.
	 */
	init_data: function() {
		var success = true;

		if(Perspectives.root_prefs == null) {
			var prefstr = "@mozilla.org/preferences-service;1";
			if(prefstr in Cc) {
				Perspectives.root_prefs = Cc[prefstr].
					getService(Ci.nsIPrefBranchInternal);
			}
			else {
				Pers_debug.d_print("error",
					"Could not define Perspectives.root_prefs!");
				success = false;
			}
		}

		if(Perspectives.overrideService == null) {
			var servstr = "@mozilla.org/security/certoverride;1";
			if(servstr in Cc) {
				Perspectives.overrideService = Cc[servstr].
					getService(Ci.nsICertOverrideService);
			}
			else {
				Pers_debug.d_print("error",
					"Could not define Perspectives.overrideServices!");
				success = false;
			}
		}
		//TODO: initialize data from other objects here too

		return success;
	},

	state: {
		STATE_IS_BROKEN   : Ci.nsIWebProgressListener.STATE_IS_BROKEN,
		STATE_IS_INSECURE : Ci.nsIWebProgressListener.STATE_IS_INSECURE,
		STATE_IS_SECURE   : Ci.nsIWebProgressListener.STATE_IS_SECURE
	},

	is_nonrouted_ip: function(ip_str) {
		for(var i = 0; i < Perspectives.nonrouted_ips.length; i++) {
			if(ip_str.match(Perspectives.nonrouted_ips[i])) {
				return true;
			}
		}
		return false;
	},

	tab_info_cache: {},

	//Sets the tooltip and the text of the favicon popup on https sites
	setFaviconText: function(str) {
		var box = document.getElementById("identity-box");
		if(box) {
			box.tooltipText = str;
		}
		else { // SeaMonkey
			box = document.getElementById("security-button");
			if(box) {
				box.tooltipText = str;
			}
		}
	},

	getFaviconText: function() {
		var box = document.getElementById("identity-box");
		if(box) {
			return box.tooltipText;
		}
		// SeaMonkey
		box = document.getElementById("security-button");
		if(box) {
			return box.tooltipText;
		}
		return ''
	},

	// cached result data
	// FIXME: this should be merged with TabInfo, once TabInfo is made into a
	// real object
	SslCert: function(md5, summary, svg, duration, cur_consistent, inconsistent_results, weakly_seen) {
		this.md5                  = md5;
		this.cur_consistent       = cur_consistent;
		this.inconsistent_results = inconsistent_results;
		this.weakly_seen          = weakly_seen;
		this.duration             = duration;
		this.summary              = summary; // this doesn't really need to be cached
		this.tooltip              = '';
		this.svg                  = svg;     // this doesn't really need to be cached
		this.created              = Pers_util.get_unix_time();
	},

	get_invalid_cert_SSLStatus: function(uri) {
		var recentCertsSvc = null;

		// firefox <= 19 and seamonkey
		if(typeof Cc["@mozilla.org/security/recentbadcerts;1"] !== "undefined") {

			recentCertsSvc = Cc["@mozilla.org/security/recentbadcerts;1"]
				.getService(Ci.nsIRecentBadCertsService);
		}
		// firefox >= v20
		else if(typeof Cc["@mozilla.org/security/x509certdb;1"] !== "undefined") {

			var certDB = Cc["@mozilla.org/security/x509certdb;1"]
				.getService(Ci.nsIX509CertDB);
			if(!certDB) {
				return null;
			}

			Cu.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
			recentCertsSvc = certDB.getRecentBadCerts(PrivateBrowsingUtils.isWindowPrivate(window));
		}
		else {
			Pers_debug.d_print("error", "No way to get invalid cert status!");
			return null;
		}

		if(!recentCertsSvc) {
			return null;
		}

		var hostWithPort = uri.host + ":" + ((uri.port === -1) ? 443 : uri.port);
		var gSSLStatus = recentCertsSvc.getRecentBadCert(hostWithPort);
		if(!gSSLStatus) {
			return null;
		}
		return gSSLStatus;
	},

	// gets current certificate, if it FAILED the security check
	psv_get_invalid_cert: function(uri) {
		var gSSLStatus = Perspectives.get_invalid_cert_SSLStatus(uri);
		if(!gSSLStatus) {
			return null;
		}
		return gSSLStatus.QueryInterface(Ci.nsISSLStatus)
			.serverCert;
	},

	// gets current certificate, if it PASSED the browser check
	psv_get_valid_cert: function(ui) {
		try {
			ui.QueryInterface(Ci.nsISSLStatusProvider);
			if(!ui.SSLStatus) {
				return null;
			}
			return ui.SSLStatus.serverCert;
		}
		catch(e) {
			Pers_debug.d_print("error", "Perspectives Error: " + e);
			return null;
		}
	},

	getServiceId: function(uri) {
		return uri.host + ":" + ((uri.port === -1) ? 443 : uri.port) + ",2"; // Magic number?
	},

	getCertificate: function(browser) {
		var uri = browser.currentURI;
		var ui  = browser.securityUI;
		var cert = this.psv_get_valid_cert(ui);
		if(!cert) {
			cert = this.psv_get_invalid_cert(uri);
		}

		if(!cert) {
			return null;
		}
		return cert;
	},

	getNotaryList: function() {
		var all_notaries = [];
		try {
			var list_txt = Perspectives.root_prefs.getCharPref("perspectives.additional_notary_list");
			var additional_notaries = Pers_util.loadNotaryListFromString(list_txt);
			all_notaries = all_notaries.concat(additional_notaries);

			var use_default_notaries = Perspectives.root_prefs.getBoolPref("perspectives.use_default_notary_list");
			if(use_default_notaries) {

				var default_notaries = Pers_util.loadNotaryListFromString(
					Perspectives.root_prefs.getCharPref("perspectives.default_notary_list"));
				all_notaries = all_notaries.concat(default_notaries);
			}
		} catch(e) {
			Pers_debug.d_print("error", "Error parsing additional notaries: " + e);
		}
		return all_notaries;
	},


	queryNotaries: function(notaries, uri, md5Fingerprint, processResultsCb) {
		// Creates a new closure which has to be called for every reponse.
		// The closure keeps track of the number of tries internally
		// and calls the provided "processResults" callback when all requests are finished.
		var queryNotariesClosure = (function(notaries, uri, processResultsCb) {
			var query_results = _.map(notaries, function(notary) {
				return {server: notary.host, obs: []}
			});
			var num_tries  = Perspectives.root_prefs.getIntPref("extensions.perspectives.query_retries");
			var timeout_id = null;

			var closure = function(notary_host, server_result) {
				if(num_tries > 0) {
					if(server_result != null) {
						var query_result = _.find(query_results, function(query_result) {
							return query_result.server === notary_host
						});
						if(query_result.obs.length === 0 && !query_result.is_valid) {
							Pers_debug.d_print("query", "adding result from: " + notary_host);
							query_result.obs      = server_result.obs;
							query_result.is_valid = server_result.is_valid;
						}
						else {
							Pers_debug.d_print("query",
								"Ignoring duplicate reply for '" +
									Perspectives.getServiceId(uri) + "' from '" +
									server_result.server + "'")
						}
					}

					var num_finished = _.find(query_results, function(query_result) {
						return query_result.obs.length > 0
					}).length;
					if(num_finished === notaries.length) {
						window.clearTimeout(timeout_id);
						Pers_debug.d_print("query", "got all server replies");
						Perspectives.notaryQueriesComplete(query_results, uri, md5Fingerprint, processResultsCb)
					}
				}
			};

			var timeout = function() {
				Pers_debug.d_print("query", "timeout #" + (Perspectives.root_prefs.getIntPref("extensions.perspectives.query_retries") - num_tries) +
					" querying for '" + timeout_id + "'");
				Pers_debug.d_print("query", query_results);

				if(num_tries > 0) {
					num_tries--;
					timeout_id = window.setTimeout(timeout, Perspectives.root_prefs.getIntPref("extensions.perspectives.query_timeout_ms"))
				}
				else {
					Pers_debug.d_print("query", "got some server replies");
					Perspectives.notaryQueriesComplete(query_results, uri, md5Fingerprint, processResultsCb)
				}
			};
			timeout_id = window.setTimeout(timeout, Perspectives.root_prefs.getIntPref("extensions.perspectives.query_timeout_ms"));

			return closure
		})(notaries, uri, processResultsCb);

		notaries.forEach(function(notary) {
			Pers_debug.d_print("main", "Sending query to notary " + notary.host);
			Perspectives.querySingleNotary(notary, uri, queryNotariesClosure)
		})
	},

	querySingleNotary: function(notary, uri, queryNotariesClosure) {
		var full_url = notary.host +
			"?host=" + uri.host + "&port=" + ((uri.port === -1) ? 443 : uri.port) + "&service_type=2&";
		if(full_url.substring(0, 4) !== 'http') {
			// default to unencrypted queries if nothing is specified,
			// since we don't know if the server supports HTTPS.
			full_url = "http://" + full_url;
		}
		Pers_debug.d_print("query", "sending query: '" + full_url + "'");
		var req = new XMLHttpRequest();
		req.open("GET", full_url, true);
		req.onreadystatechange = function() {
			Perspectives.notaryAjaxCallback(req, notary, Perspectives.getServiceId(uri), queryNotariesClosure)
		};
		req.send(null);
	},

	notaryAjaxCallback: function(req, notary, service_id, queryNotariesClosure) {
		if(req.readyState === 4) {
			if(req.status === 200) {
				try {
					Pers_debug.d_print("querylarge", req.responseText);
					var server_node = req.responseXML.documentElement;
					var server_result = Pers_xml.
						parse_server_node(server_node, "1");
					var bin_result = Pers_xml.
						pack_result_as_binary(server_result, service_id);
					Pers_debug.d_print("querylarge",
						Pers_xml.resultToString(server_result));
					var verifier =
						Cc["@mozilla.org/security/datasignatureverifier;1"].
							createInstance(Ci.nsIDataSignatureVerifier);
					var result = verifier.verifyData(bin_result,
						server_result.signature, notary.public_key);
					if(result) {
						// TODO: move into a check function
						// ... and import UnderscoreJS and use functional style programming
						server_result.is_valid = true;
						for(var i = 0; i < server_result.obs.length; i++) {
							var obs = server_result.obs[i];
							if(server_result.is_valid) {
								for(var j = 0; j < obs.timestamps.length; j++) {
									var ts = obs.timestamps[j];
									if(ts.end < ts.start) {
										server_result.is_valid = false;
										break;
									}
								}
							} else {
								break
							}
						}
					} else {
						Pers_debug.d_print("error", "Invalid signature from : " +
													notary_server.host);
						server_result.is_valid = false;
					}
					server_result.server = notary.host;

					queryNotariesClosure(notary.host, server_result)
				} catch(e) {
					Pers_debug.d_print("error", "exception in notaryAjaxCallback: " + e);
				}
			} else { // HTTP ERROR CODE
				Pers_debug.d_print("error",
					"HTTP Error code '" + req.status + "' when querying notary");
			}
		}
	},

	// return the quorum as an integer
	// e.g. useful for comparing against the number of results
	getQuorumAsInt: function() {
		var MIN_NOTARY_COUNT = 1;
		//FIXME: we can cache the value inside getNotaryList() if calling is too slow.
		var notary_count = this.getNotaryList().length;
		var q_thresh = Perspectives.root_prefs.
			getIntPref("perspectives.quorum_thresh") / 100;
		var q_count = Math.round(notary_count * q_thresh);

		if(q_count < MIN_NOTARY_COUNT) {
			q_count = MIN_NOTARY_COUNT;
		}
		else if(q_count > notary_count) {
			q_count = notary_count;
		}

		return q_count;
	},

	notaryQueriesComplete: function(server_result_list, uri, md5Fingerprint, processResultsCb) {
		try {
			if(Perspectives.strbundle == null) {
				Perspectives.strbundle = document.getElementById("notary_strings");
			}

			var test_key = md5Fingerprint.toLowerCase();
			// 2 days (FIXME: make this a pref)
			var max_stale_sec = 2 * 24 * 3600;
			var q_required = Perspectives.getQuorumAsInt();
			var unixtime = Pers_util.get_unix_time();
			var quorum_duration = Pers_client_policy.get_quorum_duration(test_key,
				server_result_list, q_required, max_stale_sec, unixtime);
			var is_cur_consistent = quorum_duration !== -1;

			var weak_check_time_limit = Perspectives.root_prefs.
				getIntPref("perspectives.weak_consistency_time_limit");
			var inconsistent_check_max = Perspectives.root_prefs.
				getIntPref("perspectives.max_timespan_for_inconsistency_test");
			var is_inconsistent = Pers_client_policy.inconsistency_check(server_result_list,
				inconsistent_check_max, weak_check_time_limit);
			var weakly_seen = Pers_client_policy.key_weakly_seen_by_quorum(test_key,
				server_result_list, q_required, weak_check_time_limit);

			var qd_days = quorum_duration / (3600 * 24);
			var obs_text = "";
			for(var i = 0; i < server_result_list.length; i++) {
				obs_text += "\nNotary: " + server_result_list[i].server + "\n";
				obs_text += Pers_xml.resultToString(server_result_list[i]);
			}
			var qd_days_str = (qd_days > 5 || qd_days === 0) ? Math.round(qd_days) : qd_days.toFixed(1);
			var qd_str = is_cur_consistent ? qd_days_str + " days" : "none";
			var str = Perspectives.strbundle.getString("notaryLookupFor") +
				": " + Perspectives.getServiceId(uri) + "\n";
			str += Perspectives.strbundle.getString("LegendBrowsersKey") +
				" = '" + test_key + "'\n";
			str += Perspectives.strbundle.getString("results") + ":\n";
			str += Perspectives.strbundle.getString("quorumDuration") +
				": " + qd_str + "\n";
			str += Perspectives.strbundle.getString("notaryObservations") +
				": \n" + obs_text + "\n";
			//Pers_debug.d_print("main", "\n" + str + "\n");
			var required_duration = Perspectives.root_prefs.getIntPref("perspectives.required_duration");
			var svg = Pers_gen.get_svg_graph(Perspectives.getServiceId(uri), server_result_list, 30,
				unixtime, test_key, max_stale_sec, required_duration);
			var query_results = new Perspectives.SslCert(test_key,
				str, svg, qd_days,
				is_cur_consistent,
				is_inconsistent,
				weakly_seen);
			processResultsCb(query_results)

		} catch(e) {
			Pers_util.pers_alert("Error in notaryQueriesComplete: " + e);
		}
	},

	do_override: function(cert, uri, isTemp) {
		Pers_debug.d_print("main", "Do Override\n");

		var flags = 0;
		var gSSLStatus = Perspectives.get_invalid_cert_SSLStatus(uri);
		if(gSSLStatus != null) {
			if(gSSLStatus.isUntrusted) {
				flags |= Perspectives.overrideService.ERROR_UNTRUSTED;
			}
			if(gSSLStatus.isDomainMismatch) {
				flags |= Perspectives.overrideService.ERROR_MISMATCH;
			}
			if(gSSLStatus.isNotValidAtThisTime) {
				flags |= Perspectives.overrideService.ERROR_TIME;
			}

			Perspectives.overrideService.rememberValidityOverride(
				uri.asciiHost, uri.port, cert, flags, isTemp);
		}

		return flags;
	},

	// Updates the status of the current page
	updateStatus: function(browser, cert, uri, security_state, is_forced) {
		if(Perspectives.strbundle == null) {
			Perspectives.strbundle = document.getElementById("notary_strings");
		}

		Pers_debug.d_print("main", "Update Status");

		var text = '';
		var error_text = Perspectives.detectInvalidURI(uri);
		if(error_text) {
			text = Perspectives.strbundle.
				getFormattedString("waitingOnURLData", [error_text]);
			Pers_statusbar.setStatus(null, Pers_statusbar.STATE_NEUT, text);
			return;
		}
		var ti = Perspectives.getCurrentTabInfo(uri);
		if(uri.scheme !== "https") {
			text = Perspectives.strbundle.
				getFormattedString("nonHTTPSError", [uri.host, uri.scheme]);
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text);
			ti.reason_str = text;
			return;
		}

		Pers_debug.d_print("main", "Update Status: " + uri.spec);

		if(!cert) {
			text = Perspectives.strbundle.
				getFormattedString("noCertError", [uri.host]);
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text);
			ti.reason_str = text;
			return;
		}

		var md5 = cert.md5Fingerprint.toLowerCase();

		ti.is_override_cert = Perspectives.overrideService.isCertUsedForOverrides(cert, true, true);
		Pers_debug.d_print("main",
			"is_override_cert = " + ti.is_override_cert);
		var check_good = Perspectives.root_prefs.
			getBoolPref("perspectives.check_good_certificates");

		// see if the browser has this cert installed prior to this browser session
		// seems like we can't tell the difference between an exception added by the user
		// manually and one we installed permanently during a previous browser run.
		ti.already_trusted = !(security_state & Perspectives.state.STATE_IS_INSECURE) && !(ti.is_override_cert);

		if(Perspectives.is_whitelisted_by_user(uri.host)) {
			text = Perspectives.strbundle.
				getFormattedString("configuredToWhitelistWithHost", [uri.host]);
			if(!(ti.already_trusted || ti.is_override_cert)) {
				var isTemp = !Perspectives.root_prefs.getBoolPref("perspectives.exceptions.permanent");

				setTimeout(function() {
					var flags = Perspectives.do_override(cert, uri, isTemp);
					if(flags) {
						setTimeout(function() {
							browser.loadURIWithFlags(uri.spec, flags);
						}, 25);
						Perspectives.setFaviconText(text);
						Pers_notify.do_notify(browser, ti.last_banner_type, Pers_notify.TYPE_WHITELIST);
						ti.last_banner_type = Pers_notify.TYPE_WHITELIST
					}
				}, 1000);
			}

			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_SEC, text);
			ti.reason_str = text;
			return;
		} else {
			// Note: we no longer do a DNS look-up to to see if a DNS name maps
			// to an RFC 1918 address, as this 'leaked' DNS info for users running
			// anonymizers like Tor.  It was always just an insecure guess anyway.
			var unreachable = Perspectives.is_nonrouted_ip(uri.host);
			if(unreachable) {
				text = Perspectives.strbundle.
					getFormattedString("rfc1918Error", [uri.host]);
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text);
				ti.reason_str = text;
				return;
			}
		}

		if(!check_good && ti.already_trusted && !is_forced) {
			text = Perspectives.strbundle.
				getString("noProbeRequestedError");
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text);
			ti.reason_str = text;
			return;
		}

		// clear cache if it is stale
		var unix_time = Pers_util.get_unix_time();
		var max_cache_age_sec = Perspectives.root_prefs.getIntPref("perspectives.max_cache_age_sec");
		if(ti.query_results && ti.query_results.created < (unix_time - max_cache_age_sec)) {
			Pers_debug.d_print("main", "Cached query results are stale.  Re-evaluate security.");
			delete ti.query_results;
		}
		if(ti.query_results && ti.query_results.md5 !== md5) {
			Pers_debug.d_print("main", "Current and cached key disagree.  Re-evaluate security.");
			delete ti.query_results;
		}

		var processCb = _.partial(Perspectives.process_results_main, browser, cert, uri, security_state, ti);

		if(ti.query_results) {
			setTimeout(processCb(ti.query_results), 0); // simulate asynchronous call to make behaviour consistent
		} else {
			Pers_debug.d_print("main", uri.host + " needs a request");
			var needs_perm = Perspectives.root_prefs
				.getBoolPref("perspectives.require_user_permission");
			if(needs_perm && !(ti.has_user_permission)) {
				Pers_debug.d_print("main", "needs user permission");
				Pers_notify.do_notify(browser, ti.last_banner_type, Pers_notify.TYPE_NEEDS_PERMISSION);
				ti.last_banner_type = Pers_notify.TYPE_NEEDS_PERMISSION;

				text = Perspectives.strbundle.getString("needsPermission");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text);
				ti.reason_str = text;
				return;
			}

			// respect private browsing mode
			var contact_private = Perspectives.root_prefs
				.getBoolPref("extensions.perspectives.contact_in_private_browsing_mode");
			if(!contact_private) {
				var is_private = true; // default to true, better err on the save side
				try { // Firefox 20+
					Cu.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
					is_private = PrivateBrowsingUtils.isWindowPrivate(window);
				} catch(e) { // pre Firefox 20
					try {
						is_private = Cc["@mozilla.org/privatebrowsing;1"].
							getService(Ci.nsIPrivateBrowsingService).
							privateBrowsingEnabled;
					} catch(e) {
						Pers_debug.d_print("main", "Can't retrieve private browsing mode. Assume 'private browsing mode activated'.");
					}
				}

				if(is_private) {
					Pers_debug.d_print("main", "don't contact notaries in private browsing mode");
					text = Perspectives.strbundle.getString("needsPermission"); // TODO: maybe add an additional localization hinting to private browsing mode
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text);
					ti.reason_str = text;
					return;
				}
			}

			// make sure we're using the most recent notary list
			var all_notaries = Perspectives.getNotaryList();
			if(all_notaries.length === 0) {
				text = Perspectives.strbundle.
					getString("listOfNotariesIsEmpty");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text);
				return;
			}

			Pers_debug.d_print("main", "Contacting notaries");

			// this call is asynchronous.  after hearing from the
			// notaries, the logic picks up again with the function
			// 'process_results_main()' below
			Perspectives.queryNotaries(all_notaries, uri, md5, processCb);
		}
	},

	process_results_main: function(browser, cert, uri, security_state, ti, query_results) {
		try {
			ti.query_results = query_results;
			if(!ti.already_trusted && Perspectives.getFaviconText().indexOf("Perspectives") < 0) {
				query_results.identityText =
					Perspectives.setFaviconText(Perspectives.getFaviconText() +
						"\n\n" + Perspectives.strbundle.getString("verificationSuccess"));
			}
			var required_duration =
				Perspectives.root_prefs.
					getIntPref("perspectives.required_duration");

			var strong_trust = query_results.cur_consistent &&
				(query_results.duration >= required_duration);
			var pref_https_weak = Perspectives.root_prefs.
				getBoolPref("perspectives.trust_https_with_weak_consistency");
			var weak_trust = query_results.inconsistent_results && query_results.weakly_seen;

			if(strong_trust) {
				// FIXME: need to clear any contrary banners
				var mixed_security = security_state & Perspectives.state.STATE_IS_BROKEN;
				if(!ti.is_override_cert && (security_state & Perspectives.state.STATE_IS_INSECURE)) {
					ti.exceptions_enabled = Perspectives.root_prefs.
						getBoolPref("perspectives.exceptions.enabled");
					if(ti.exceptions_enabled) {
						ti.override_used = true;
						var isTemp = !Perspectives.root_prefs.
							getBoolPref("perspectives.exceptions.permanent");
						var flags = Perspectives.do_override(cert, uri, isTemp);
						setTimeout(function() {
							browser.loadURIWithFlags(uri.spec, flags);
						}, 25);

						query_results.identityText = Perspectives.strbundle.
							getString("exceptionAdded");
						// don't give drop-down if user gave explicit
						// permission to query notaries
						if(ti.firstLook && !ti.has_user_permission) {
							Pers_notify.do_notify(browser, ti.last_banner_type, Pers_notify.TYPE_OVERRIDE);
							ti.last_banner_type = Pers_notify.TYPE_OVERRIDE
						}
					}
				}

				// Check if this site includes insecure embedded content.  If so, do not
				// show a green check mark, as we don't want people to incorrectly assume
				// that we imply that the site is secure.  Note: we still will query the
				// notary and will override an error page.  This is inline with the fact
				// that Firefox still shows an HTTPS page with insecure content, it
				// just does not show positive security indicators.
				if(mixed_security) {
					// FIXME: need to clear any contrary banners
					// TODO: once we have separated calculation of results
					// from applying the results and can add better tests for these,
					// wrap setting the status and the tooltip in their own function
					// so no steps are forgotten
					query_results.tooltip = Perspectives.strbundle.getString("trustedButInsecureEmbedded");
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, query_results.tooltip);
					// this will flicker, as we can't rely on just doing it on 'firstLook'
					// due to Firefox oddness
					if(ti.override_used) {
						Pers_notify.do_notify(browser, ti.last_banner_type, Pers_notify.TYPE_OVERRIDE_MIXED);
						ti.last_banner_type = Pers_notify.TYPE_OVERRIDE_MIXED
					}
				} else {
					query_results.tooltip = Perspectives.strbundle.
						getFormattedString("verifiedMessage",
							[query_results.duration.toFixed(1), required_duration]);
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_SEC,
						query_results.tooltip);
				}
			} else if(ti.already_trusted && weak_trust && pref_https_weak) {
				// FIXME: need to clear any contrary banners
				if(ti.state & Perspectives.state.STATE_IS_BROKEN) {
					query_results.tooltip = Perspectives.strbundle.getString("trustedWeaklyButInsecureEmbedded");
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT,
						query_results.tooltip);
				} else {
					query_results.tooltip = Perspectives.strbundle.getString("trustedMultipleByBrowser");
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_SEC,
						query_results.tooltip);

				}
			} else if(ti.query_results.summary.indexOf(Perspectives.strbundle.getString("sslKey")) === -1) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip =
					Perspectives.strbundle.getString("noRepliesWarning");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC,
					query_results.tooltip);
				if(!ti.already_trusted) {
					Pers_notify.do_notify(browser, ti.last_banner_type, Pers_notify.TYPE_NO_REPLIES);
					ti.last_banner_type = Pers_notify.TYPE_NO_REPLIES
				}
			} else if(query_results.inconsistent_results && !query_results.weakly_seen) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip = Perspectives.strbundle.getString("untrustedMultipleNotSeen");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC, query_results.tooltip);
				if(!ti.already_trusted) {
					Pers_notify.do_notify(ti, Pers_notify.TYPE_FAILED);
				}
			} else if(query_results.inconsistent_results) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip = Perspectives.strbundle.getString("untrustedMultipleNotVerifiable");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC, query_results.tooltip);
				if(!ti.already_trusted) {
					Pers_notify.do_notify(ti, Pers_notify.TYPE_FAILED);
				}
			} else if(!query_results.cur_consistent) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip =
					Perspectives.strbundle.getString("inconsistentWarning");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC,
					query_results.tooltip);
				// we may reconsider this in the future, but currently we don't do a
				// drop-down if things aren't consistent but the browser already trusts the cert.
				if(!ti.already_trusted && ti.firstLook) { // ti.firstLook is never set => delete?
					Pers_notify.do_notify(browser, ti.last_banner_type, Pers_notify.TYPE_FAILED);
					ti.last_banner_type = Pers_notify.TYPE_FAILED
				}
			} else if(query_results.duration < required_duration) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip = Perspectives.strbundle.
					getFormattedString("thresholdWarning",
						[query_results.duration.toFixed(1), required_duration]);
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC,
					query_results.tooltip);
				if(!ti.already_trusted && ti.firstLook) {
					Pers_notify.do_notify(browser, ti.last_banner_type, Pers_notify.TYPE_FAILED);
					ti.last_banner_type = Pers_notify.TYPE_FAILED
				}
			} else {
				// FIXME: need to clear any contrary banners
				query_results.tooltip = Perspectives.strbundle.
					getFormattedString("errorParsingNotaryEntry", [ti.uri.host]);
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_ERROR,
					query_results.tooltip);

				// Pers_notify.do_notify(ti, Pers_notify.TYPE_FAILED); // warn on error?
			}

			if(query_results.identityText) {
				Perspectives.setFaviconText(query_results.identityText);
			}
		} catch(err) {
			Pers_util.pers_alert("process_results_main error: " + err);
		}
	},

	is_whitelisted_by_user: function(host) {
		try {
			/* be cautious in case we got a bad user edit to the whitelist */
			var whitelist = Perspectives.root_prefs.
				getCharPref("perspectives.whitelist").split(",");
			return _.any(whitelist, function(entry) {
				return entry.length > 0 ? host.match(new RegExp(entry)) : false
			});
		} catch(ex) { /* ignore */
		}
		return false;
	},

	// See Documentation for nsIWebProgressListener at:
	// https://developer.mozilla.org/en/nsIWebProgressListener

	// The current approach is to clear the previous status
	// icon during onLocationChange.  For each call to
	// onSecurityChange, we call updateStatus.
	// Then, when onStateChange is called with STATE_STOP
	// we call updateStatus one last time just for good
	// measure, as this should be the last thing that happens.
	//
	// NOTE: this code needs some TLC

	//note can use request to suspend the loading
	notaryListener: {
		// Note: We intentionally do NOT call updateStatus from here, as this
		// was causing a bug that caused us to get the previous website's cert
		// instead of the correct cert.
		onLocationChange    : function(aBrowser, aWebProgress, aRequest, aURI) {
			if(Perspectives.strbundle == null) {
				Perspectives.strbundle = document.getElementById("notary_strings");
			}
			try {
				Pers_debug.d_print("main", "Location change " + aURI.spec);
				var state = Pers_statusbar.STATE_NEUT;
				var tooltip = "Perspectives";

				if(aURI != null && aURI.scheme === 'https') {
					// we'll actually send a query for https connections, so update the UI.
					state = Pers_statusbar.STATE_QUERY;
					// use the asciiHost: sometimes the host contains invalid characters, or is unset.
					// in those cases getFormattedString() will throw an exception,
					// which causes the error icon to be displayed.
					tooltip = Perspectives.strbundle.getFormattedString("contactingNotariesAbout",
						[aURI.asciiHost]);
					// TODO: can we start sending the query from right here, to begin sooner?
				}
				Pers_statusbar.setStatus(aURI, state, tooltip);
			} catch(err) {
				Pers_debug.d_print("error", "Perspectives had an internal exception: " + err);
				Pers_statusbar.setStatus(aURI, Pers_statusbar.STATE_ERROR,
					Perspectives.strbundle.getFormattedString("internalError", ["onLocationChange - " + err]));
			}
		},

		// we only call updateStatus on STATE_STOP, as a catch all in case
		// onSecurityChange was never called.
		onStateChange       : function(aBrowser, aWebProgress, aRequest, aFlag, aStatus) {
			if(aFlag & Ci.nsIWebProgressListener.STATE_STOP) {
				try {
					var browser = window.gBrowser;
					var uri = browser.currentURI;
					Pers_debug.d_print("main", "State change " + uri.spec);
					var cert = Perspectives.getCertificate(browser);
					var security_state = browser.securityUI.state;
					Perspectives.updateStatus(browser, cert, uri, security_state, false, false);
				} catch(err) {
					if(Perspectives.strbundle == null) {
						Perspectives.strbundle = document.getElementById("notary_strings");
					}

					Pers_debug.d_print("error", "Perspectives had an internal exception: " + err);
					Pers_statusbar.setStatus(Pers_statusbar.STATE_ERROR,
						Perspectives.strbundle.getFormattedString("internalError", ["onStateChange - " + err]));
				}
			}
		},

		// this is the main function we key off of.  It seems to work well, even though
		// the docs do not explicitly say when it will be called.
		onSecurityChange    : function(aBrowser, aWebProgress, aRequest, aState) {
			var uri = null;
			try {
				var browser = window.gBrowser;
				uri = browser.currentURI;
				Pers_debug.d_print("main", "Security change " + uri.spec);
				var cert = Perspectives.getCertificate(browser);
				var security_state = browser.securityUI.state;
				Perspectives.updateStatus(browser, cert, uri, security_state, false, false);
			} catch(err) {
				Pers_debug.d_print("error", "Perspectives had an internal exception: " + err);

				if(uri) {
					if(Perspectives.strbundle == null) {
						Perspectives.strbundle = document.getElementById("notary_strings");
					}
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_ERROR,
						Perspectives.strbundle.getFormattedString("internalError", ["onSecurityChange - " + err]));
				}
			}
		},

		onStatusChange      : function(aBrowser, aWebProgress, aRequest, aStateFlags, aStatus, aMessage) { },
		onProgressChange    : function(aBrowser, aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) { },
		onRefreshAttempted  : function(aBrowser, aWebProgress, aRefreshURI, aMillis, aSameURI) { },
		onLinkIconAvailable : function(aBrowser) { }
	},

	requeryAllTabs: function(b) {
		/*
		 alert("requeryAllTabs is disabled");
		 var num = b.browsers.length;
		 for(var i = 0; i < num; i++) {
		 var browser = b.getBrowserAtIndex(i);
		 Perspectives.updateStatus(window, false);
		 }
		 */
	},

	initNotaries: function() {
		try {
			Pers_debug.d_print("main", "\nPerspectives Initialization\n");

			var auto_update = this.root_prefs.getBoolPref("perspectives.enable_default_list_auto_update");
			if(auto_update) {
				Pers_util.update_default_notary_list_from_web(this.root_prefs);
			} else {
				Pers_util.update_default_notary_list_from_file(this.root_prefs);
			}
			Pers_debug.d_print("main", Perspectives.notaries);
			Pers_statusbar.setStatus(null, Pers_statusbar.STATE_NEUT, "", false);
			window.getBrowser().addProgressListener(Perspectives.notaryListener,
				Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);

			setTimeout(function() {
				Perspectives.requeryAllTabs(window.gBrowser);
			}, 4000);
			Pers_debug.d_print("main", "Perspectives Finished Initialization\n\n");
		} catch(e) {
			if(Perspectives.strbundle == null) {
				Perspectives.strbundle = document.getElementById("notary_strings");
			}

			Pers_util.pers_alert(Perspectives.strbundle.getFormattedString("internalError", ["initNotaries - " + e]));
		}
	},

	detectInvalidURI: function(uri) {
		if(Perspectives.strbundle == null) {
			Perspectives.strbundle = document.getElementById("notary_strings");
		}

		if(!uri) {
			return Perspectives.strbundle.getString("noDataError");
		}

		// sometimes things blow up because accessing uri.host throws an exception
		try {
			var ignore = uri.host;
			if(!uri.host) {
				throw ""
			}
		} catch(e) {
			return Perspectives.strbundle.getString("notValidRemoteServer");
		}
		return null;
	},

	getCurrentTabInfo: function(uri) {
		var ti = Perspectives.tab_info_cache[Perspectives.getServiceId(uri)];
		if(!ti) {
			ti = {};
			// defaults
			ti.firstLook = true;
			ti.override_used = false;
			ti.has_user_permission = false;
			ti.last_banner_type = null;
			Perspectives.tab_info_cache[Perspectives.getServiceId(uri)] = ti;
		}
		ti.reason_str = "";
		return ti;
	},

	forceStatusUpdate: function(win) {
		if(Perspectives.strbundle == null) {
			Perspectives.strbundle = document.getElementById("notary_strings");
		}
		var browser = win.gBrowser;
		var uri = browser.currentURI;
		var error_text = Perspectives.detectInvalidURI(uri);
		if(error_text) {
			Pers_util.pers_alert(Perspectives.strbundle.getString("invalidURI") + " (" + error_text + ")");
			return;
		}
		var ti = Perspectives.getCurrentTabInfo(uri);
		if(ti) {
			Pers_debug.d_print("main", "Forced request, clearing cache for '" + uri.host + "'");
			ti.has_user_permission = true; // forcing a check is implicit permission
			delete ti.query_results;
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_QUERY,
				Perspectives.strbundle.getFormattedString("contactingNotariesAbout", [uri.host]), false);
			var cert = Perspectives.getCertificate(browser);
			var security_state = browser.securityUI.state;
			Perspectives.updateStatus(browser, cert, uri, security_state, true, false);
		} else {
			Pers_debug.d_print("main", "Requested force check with valid URI, but no tab_info is found");
		}
	},

	// In Perspectives v4.0 the default settings were changed to check with notaries for *all* https websites,
	// rather than only querying for sites that showed a certificate error.
	// If the user has upgraded from an old version of Perspectives (<4.0) to a newer version (>=4.0),
	// ask them if they would now prefer to check all https websites.
	prompt_update: function() {
		try {
			//'prompt_update_all_https_setting' stores a value for "have we already asked the user about this?"
			var ask_update = Perspectives.root_prefs.
				getBoolPref("perspectives.prompt_update_all_https_setting");

			if(ask_update === true) {

				var check_good = Perspectives.root_prefs.
					getBoolPref("perspectives.check_good_certificates");

				if(!check_good) {

					var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
						.getService(Ci.nsIPromptService);
					var check = {value: false};
					var buttons =
						prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
							prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_IS_STRING +
							prompts.BUTTON_POS_0_DEFAULT;

					if(Perspectives.strbundle == null) {
						Perspectives.strbundle = document.getElementById("notary_strings");
					}

					var answer = prompts.confirmEx(null,
						Perspectives.strbundle.getString("updatePromptTitle"),
						Perspectives.strbundle.getString("updatePrompt"), buttons,
						Perspectives.strbundle.getString("updatePromptButtonYes"), // the default button
						Perspectives.strbundle.getString("updatePromptButtonNo"),
						"", null, check);
					if(answer === 0) {
						Perspectives.root_prefs.
							setBoolPref("perspectives.check_good_certificates",
								true);
					}
				}
			}
		}
		catch(e) {
			Pers_debug.d_print("error", "Error: could not prompt to update preferences about check_good_certificates: " + e);
		}
		finally {
			//set the flag to not ask the user again, even (especially!) if something went wrong.
			//this way even in the worst case the user will only get a popup once.
			//they can always change their preferences later through the prefs dialog if they wish.
			Perspectives.root_prefs.
				setBoolPref("perspectives.prompt_update_all_https_setting",
					false);
		}
	}
};
