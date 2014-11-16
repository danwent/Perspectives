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

	// Data

	// See init_data().
	// Always call init_data() before working with these variables!
	root_prefs     : null,
	overrideService: null,
	recentSSLStatus : null, // HACK (lambdor): getRecentBadCert has been removed in FF33 thus save here

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
		return _.any(Perspectives.nonrouted_ips, function(nrip) {
			return ip_str.match(nrip);
		});
	},

	tab_info_cache: [],
	redirects     : [],

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
		return '';
	},

	// cached result data
	// FIXME: this should be merged with TabInfo, once TabInfo is made into a
	// real object
	SslCert: function(md5, summary, svg, duration, cur_consistent, inconsistent_results, weakly_seen, server_result_list) {
		this.md5                  = md5;
		this.cur_consistent       = cur_consistent;
		this.inconsistent_results = inconsistent_results;
		this.weakly_seen          = weakly_seen;
		this.duration             = duration;
		this.summary              = summary; // this doesn't really need to be cached
		this.tooltip              = '';
		this.svg                  = svg;     // this doesn't really need to be cached
		this.server_result_list   = server_result_list;
		this.created              = Pers_util.get_unix_time();
	},

	get_invalid_cert_SSLStatus: function(uri) {
		var recentCertsSvc = null;
		var badCertServiceMissing = false;

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

			// nsIRecentBadCerts functionality removed in Firefox 33
			if (typeof certDB.getRecentBadCerts === "function") {
				Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
				recentCertsSvc = certDB.getRecentBadCerts(PrivateBrowsingUtils.isWindowPrivate(window));
			}
			else
			{
				badCertServiceMissing = true;
			}
		}
		else {
			Pers_debug.d_print("error", "No way to get invalid cert status!");
			return null;
		}

		if(!recentCertsSvc && !badCertServiceMissing) {
			return null;
		}

		var hostWithPort = uri.host + ":" + ((uri.port === -1) ? 443 : uri.port);
		var gSSLStatus = badCertServiceMissing ? Perspectives.recentSSLStatus : recentCertsSvc.getRecentBadCert(hostWithPort);
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
		return uri.host + ":" + ((uri.port === -1) ? 443 : uri.port) + ",2"; // TODO: Magic number?
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

	// [{host: "example.com:8080", public_key: "base64string"}]
	getNotaryList: function() {
		var ret = [];
		try {
			var list_txt = Perspectives.root_prefs.getCharPref("perspectives.additional_notary_list");
			var additional_notaries = Pers_util.loadNotaryListFromString(list_txt);
			ret = ret.concat(additional_notaries);
		} catch(e) {
			Pers_debug.d_print("error", "Error parsing additional notaries: " + e);
		}

		var use_default_notaries = Perspectives.root_prefs.getBoolPref("perspectives.use_default_notary_list");
		if(use_default_notaries) {
			try {
				var default_notaries = Pers_util.loadNotaryListFromString(
					Perspectives.root_prefs.getCharPref("perspectives.default_notary_list"));
				ret = ret.concat(default_notaries);
			} catch(e) {
				Pers_debug.d_print("error", "Error parsing default notaries: " + e);
			}
		}
		return ret;
	},

	queryNotaries: function(uri, notaries, publish_serverresultlist, signature_verifier) {
		// Creates a new closure which has to be called for every reponse.
		// The closure keeps track of the number of tries internally
		// and calls the provided "processResults" callback when all requests are finished.
		var query_notaries_closure = (function(notaries, uri, publish_serverresultlist, signature_verifier) {
			var server_result_list = _.map(notaries, function(notary) {
				return {server: notary.host, obs: [], is_valid: false};
			});

			var cert_              = null;
			var q_required_        = 0;
			var required_duration_ = Infinity;

			var num_tries  = Perspectives.root_prefs.getIntPref("extensions.perspectives.query_retries");
			var timeout_id = null;

			var timeout = function() {
				Pers_debug.d_print("query", "timeout #" + (Perspectives.root_prefs.getIntPref("extensions.perspectives.query_retries") - num_tries) +
					" querying for '" + timeout_id + "'");

				num_tries--;
				if(num_tries > 0) {
					var timeout_ms = Perspectives.root_prefs.getIntPref("extensions.perspectives.query_timeout_ms");
					timeout_id = setTimeout(timeout, timeout_ms);

					var hostsTodo    = _.pluck(_.filter(server_result_list, function(server_result) {
						return server_result.obs.length === 0;
					}), "server");
					var notariesTodo = _.filter(notaries, function(notary) {
						return _.contains(hostsTodo, notary.host);
					});
					Pers_debug.d_print("query", "Still need to query: " + _.pluck(notariesTodo, 'host') + " tab=" + uri.host + " timeout_ms=" + timeout_ms);
					_.each(notariesTodo, function(notary) {
						Perspectives.querySingleNotary(uri, notary, publish_server_result, signature_verifier);
					});
				}
				else {
					Pers_debug.d_print("main", "Publish server_result_list in query_notaries_closure() (timed out).");
					publish_serverresultlist(server_result_list);
				}
			};
			timeout_id = setTimeout(timeout, Perspectives.root_prefs.getIntPref("extensions.perspectives.query_timeout_ms"));

			var publish_server_result = function(notary_host, new_server_result) {
				if(timeout_id !== null) {
					window.clearTimeout(timeout_id);
				}

				if(num_tries >= 0) {
					if(new_server_result != null) {
						var old_server_result = _.find(server_result_list, function(sr) {
							return sr.server === notary_host;
						});
						if(old_server_result.obs.length === 0 || !old_server_result.is_valid) {
							Pers_debug.d_print("query", "adding result from: " + notary_host);
							old_server_result.obs      = new_server_result.obs;
							old_server_result.is_valid = new_server_result.is_valid;
						}
						else {
							Pers_debug.d_print("query",
								"Ignoring duplicate or invalid reply for '" +
									Perspectives.getServiceId(uri) + "' from '" +
									new_server_result.server + "'");
						}
					}

					var strong_trust = false;
					if(cert_ != null) {
						// check current results against quorum
						// TODO: extract as function
						// code snippet taken from notaryQueriesComplete
						var test_key;
						if (cert_.md5Fingerprint !== undefined) {
							test_key = cert_.md5Fingerprint.toLowerCase();
						}
						else {
							test_key = Perspectives.calculateMD5(cert_.getRawDER({}));
						}

						var max_stale_sec = 2 * 24 * 3600; // 2 days (FIXME: make this a pref)
						var unixtime = Pers_util.get_unix_time();
						var quorum_duration = Pers_client_policy.get_quorum_duration(test_key,
							server_result_list, q_required_, max_stale_sec, unixtime);
						var is_cur_consistent = quorum_duration !== -1;
						var qd_days = quorum_duration / (3600 * 24);

						// code snippet taken from process_results_main
						strong_trust = is_cur_consistent && (qd_days >= required_duration_);
					}

					// check if all notaries answered already
					var num_finished = _.filter(server_result_list, function(sr) {
						return sr.obs.length > 0;
					}).length;

					if(strong_trust || num_finished === notaries.length) {
						if(strong_trust && num_finished === notaries.length) {
							Pers_debug.d_print("main", "Publish server_result_list in query_notaries_closure() (shortcircuited).");
						} else {
							Pers_debug.d_print("main", "Publish server_result_list in query_notaries_closure() (all results).");
						}
						publish_serverresultlist(server_result_list);
						num_tries = -1;
					}
				}
			};

			var publish_cert = function(cert, q_required, required_duration) {
				cert_              = cert;
				q_required_        = q_required;
				required_duration_ = required_duration;
			};

			return { publish_server_result: publish_server_result, publish_cert: publish_cert };
		})(notaries, uri, publish_serverresultlist, signature_verifier);

		_.each(notaries, function(notary) {
			Perspectives.querySingleNotary(uri, notary, query_notaries_closure.publish_server_result, signature_verifier);
		});

		return query_notaries_closure.publish_cert;
	},

	querySingleNotary: function(uri, notary, publish_server_result, signature_verifier) {
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
			Perspectives.notaryAjaxCallback(req, notary, Perspectives.getServiceId(uri), publish_server_result, signature_verifier);
		};
		req.send(null);
	},

	notaryAjaxCallback: function(req, notary, service_id, publish_server_result, signature_verifier) {
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
					var verifier = signature_verifier == null ?
						Cc["@mozilla.org/security/datasignatureverifier;1"].
							createInstance(Ci.nsIDataSignatureVerifier) : signature_verifier;
					var result = verifier.verifyData(bin_result,
						server_result.signature, notary.public_key);
					if(result && _.isArray(server_result.obs)) {
						server_result.is_valid = _.all(server_result.obs, function(o) {
							return (_.isArray(o.timestamps) && _.all(o.timestamps, function(ts) {
								return ts.end > ts.start;
							}));
						});
					} else {
						Pers_debug.d_print("error", "Invalid signature from : " +
							notary.host);
						server_result.is_valid = false;
					}
					server_result.server = notary.host;

					publish_server_result(notary.host, server_result);
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

	calculateMD5: function(array) {
		// calculate the MD5 hash of a given array
		// uses third-party library SparkMD5.
		// many thanks to them for sharing under a compatible license.
		var hash = SparkMD5.ArrayBuffer.hash(array, false);
		hash = hash.toLowerCase().match(/.{1,2}/g).join(':');
		return hash;
	},

	notaryQueriesComplete: function(uri, server_result_list, cert, process_results_callback) {
		try {
			if(Perspectives.strbundle == null) {
				Perspectives.strbundle = document.getElementById("notary_strings");
			}

			Pers_debug.d_print("main", "all notary queries complete");

			var test_key;
			if (cert.md5Fingerprint !== undefined) {
				test_key = cert.md5Fingerprint.toLowerCase();
			}
			else {
				test_key = Perspectives.calculateMD5(cert.getRawDER({}));
			}

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
			var qd_str = "none";
			if (is_cur_consistent)
			{
				if (qd_days > 5 || qd_days === 0)
				{
					qd_str = Math.round(qd_days) + " days";
				}
				else
				{
					qd_str = qd_days.toFixed(1) + " days";
				}
			}
			var str =
				Perspectives.strbundle.getString("notaryLookupFor"   ) + ": "   + Perspectives.getServiceId(uri) + "\n" +
			    Perspectives.strbundle.getString("LegendBrowsersKey" ) + ": '"  + test_key + "'" +               + "\n" +
			    Perspectives.strbundle.getString("results"           ) + ":"                                     + "\n" +
			    Perspectives.strbundle.getString("quorumDuration"    ) + ": "   + qd_str                         + "\n" +
			    Perspectives.strbundle.getString("notaryObservations") + ": \n" + obs_text                       + "\n";
			var required_duration = Perspectives.root_prefs.getIntPref("perspectives.required_duration");
			var server_result_list_sorted = Pers_gen.sort_server_result_list(server_result_list, test_key, max_stale_sec, unixtime);
			var svg = Pers_gen.get_svg_graph(Perspectives.getServiceId(uri), server_result_list_sorted, 30,
				unixtime, test_key, max_stale_sec);
			var query_results = new Perspectives.SslCert(test_key,
				str, svg, qd_days,
				is_cur_consistent,
				is_inconsistent,
				weakly_seen,
				server_result_list_sorted);

			process_results_callback(query_results, cert, uri);
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

	process_results_main: function(ti, browser, security_state, query_results, cert, uri) {
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
					var exceptions_enabled = Perspectives.root_prefs.getBoolPref("perspectives.exceptions.enabled");
					if(exceptions_enabled) {
						ti.override_used = true;
						var isTemp = !Perspectives.root_prefs.
							getBoolPref("perspectives.exceptions.permanent");
						var flags = Perspectives.do_override(cert, uri, isTemp);
						setTimeout(function() {
							browser.loadURIWithFlags(uri.spec, flags);
						}, 25); // TODO: magic number or why not 0?

						query_results.identityText = Perspectives.strbundle.
							getString("exceptionAdded");
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
					ti.state   = Pers_statusbar.STATE_NEUT;
					ti.tooltip = query_results.tooltip;
				} else {
					query_results.tooltip = Perspectives.strbundle.
						getFormattedString("verifiedMessage",
							[query_results.duration.toFixed(1), required_duration]);
					ti.state   = Pers_statusbar.STATE_SEC;
					ti.tooltip = query_results.tooltip;
				}
			} else if(ti.already_trusted && weak_trust && pref_https_weak) {
				// FIXME: need to clear any contrary banners
				if(ti.state & Perspectives.state.STATE_IS_BROKEN) {
					query_results.tooltip = Perspectives.strbundle.getString("trustedWeaklyButInsecureEmbedded");
					ti.state   = Pers_statusbar.STATE_NEUT;
					ti.tooltip = query_results.tooltip;
				} else {
					query_results.tooltip = Perspectives.strbundle.getString("trustedMultipleByBrowser");
					ti.state   = Pers_statusbar.STATE_SEC;
					ti.tooltip = query_results.tooltip;
				}
			} else if(ti.query_results.summary.indexOf(Perspectives.strbundle.getString("sslKey")) === -1) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip =
					Perspectives.strbundle.getString("noRepliesWarning");
				ti.state   = Pers_statusbar.STATE_NSEC;
				ti.tooltip = query_results.tooltip;

				if(!ti.already_trusted) {
					Pers_notify.do_notify(gBrowser, ti.last_banner_type, Pers_notify.TYPE_NO_REPLIES);
					ti.last_banner_type = Pers_notify.TYPE_NO_REPLIES;
				}
			} else if(query_results.inconsistent_results && !query_results.weakly_seen) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip = Perspectives.strbundle.getString("untrustedMultipleNotSeen");
				ti.state   = Pers_statusbar.STATE_NSEC;
				ti.tooltip = query_results.tooltip;

				if(!ti.already_trusted) {
					Pers_notify.do_notify(gBrowser, ti.last_banner_type, Pers_notify.TYPE_FAILED);
					ti.last_banner_type = Pers_notify.TYPE_FAILED;
				}
			} else if(query_results.inconsistent_results) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip = Perspectives.strbundle.getString("untrustedMultipleNotVerifiable");
				ti.state   = Pers_statusbar.STATE_NSEC;
				ti.tooltip = query_results.tooltip;

				if(!ti.already_trusted) {
					Pers_notify.do_notify(gBrowser, ti.last_banner_type, Pers_notify.TYPE_FAILED);
					ti.last_banner_type = Pers_notify.TYPE_FAILED;
				}
			} else if(!query_results.cur_consistent) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip =
					Perspectives.strbundle.getString("inconsistentWarning");
				ti.state   = Pers_statusbar.STATE_NSEC;
				ti.tooltip = query_results.tooltip;
			} else if(query_results.duration < required_duration) {
				// FIXME: need to clear any contrary banners
				query_results.tooltip = Perspectives.strbundle.
					getFormattedString("thresholdWarning",
						[query_results.duration.toFixed(1), required_duration]);
				ti.state   = Pers_statusbar.STATE_NSEC;
				ti.tooltip = query_results.tooltip;
			} else {
				// FIXME: need to clear any contrary banners
				query_results.tooltip = Perspectives.strbundle.
					getFormattedString("errorParsingNotaryEntry", [uri.asciiHost]);
				ti.state   = Pers_statusbar.STATE_ERROR;
				ti.tooltip = query_results.tooltip;

				// Pers_notify.do_notify(ti, Pers_notify.TYPE_FAILED); // warn on error?
			}

			if(query_results.identityText) {
				Perspectives.setFaviconText(query_results.identityText);
			}
		} catch(err) {
			Pers_util.pers_alert("process_results_main error: " + err);
		}

		// TODO: extract UI changes from notary querying functionality
		Pers_debug.d_print("main", "Set status in process_results_main().");
		Pers_statusbar.setStatus(ti.state, ti.tooltip);
	},

	is_whitelisted_by_user: function(host) {
		try {
			/* be cautious in case we got a bad user edit to the whitelist */
			var whitelist = Perspectives.root_prefs.
				getCharPref("perspectives.whitelist").split(",");
			return _.any(whitelist, function(entry) {
				return entry.length > 0 ? host.match(new RegExp(entry)) : false;
			});
		} catch(ex) { /* ignore */
		}
		return false;
	},

	// See Documentation for nsIWebProgressListener at:
	// https://developer.mozilla.org/en/nsIWebProgressListener
	notaryListener: {
		query_notaries_by_tabinfo_IO : function(uri, ti, browser) {
			var ret = function() {};

			// clear cache if it is stale
			var unix_time = Pers_util.get_unix_time();
			var max_cache_age_sec = Perspectives.root_prefs.getIntPref("extensions.perspectives.max_cache_age_sec");
			if(ti.query_results != null && ti.query_results.created < (unix_time - max_cache_age_sec)) {
				Pers_debug.d_print("main", "Cached query results are stale. Re-evaluate security.");
				ti.query_results = null;
			}

			if(ti.query_results == null) {
				Pers_debug.d_print("main", uri.asciiHost + " needs a request");
				ti.is_cached = false;

				var notaries = Perspectives.getNotaryList();
				if(notaries.length > 0) {
					var needs_perm = Perspectives.root_prefs.getBoolPref("perspectives.require_user_permission");
					if(!needs_perm) {
						// respect private browsing mode
						var is_private = false;
						var contact_private = Perspectives.root_prefs.getBoolPref("extensions.perspectives.contact_in_private_browsing_mode");
						if(!contact_private) {
							is_private = true; // default to true, better err on the safe side
							try { // Firefox 20+
								Cu.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
								is_private = PrivateBrowsingUtils.isWindowPrivate(window);
							} catch(e) { // pre Firefox 20
								try {
									is_private = Cc["@mozilla.org/privatebrowsing;1"].
										getService(Ci.nsIPrivateBrowsingService).
										privateBrowsingEnabled;
								} catch(e) {
									Pers_debug.d_print("error", "Can't retrieve private browsing mode. Assume 'private browsing mode activated'.");
								}
							}
						}

						if(!is_private) {
							Pers_debug.d_print("main", "Contacting notaries.");
							ti.state   = Pers_statusbar.STATE_QUERY;
							ti.tooltip = Perspectives.strbundle.getFormattedString("contactingNotariesAbout", [uri.asciiHost]);

							ret = Perspectives.queryNotaries(uri, notaries, ti.await_obj.publish_serverresultlist);
						} else {
							Pers_debug.d_print("main", "Don't contact notaries in private browsing mode.");
							ti.state   = Pers_statusbar.STATE_NEUT;
							ti.tooltip = Perspectives.strbundle.getString("privateBrowsingQueriesDisabled");
						}
					} else {
						if(ti.has_user_permission) {
							Pers_debug.d_print("main", "Contacting notaries because user gave permission before.");
							ti.state   = Pers_statusbar.STATE_QUERY;
							ti.tooltip = Perspectives.strbundle.getFormattedString("contactingNotariesAbout", [uri.asciiHost]);

							ret = Perspectives.queryNotaries(uri, notaries, ti.await_obj.publish_serverresultlist);
						}
						else {
							Pers_debug.d_print("main", "Don't contact notaries because we need user permission.");
							ti.state   = Pers_statusbar.STATE_NEUT;
							ti.tooltip = Perspectives.strbundle.getString("needsPermission");

							Pers_notify.do_notify(gBrowser, ti.last_banner_type, Pers_notify.TYPE_NEEDS_PERMISSION);
							ti.last_banner_type = Pers_notify.TYPE_NEEDS_PERMISSION;
						}
					}
				} else {
					Pers_debug.d_print("main", "List of notaries is empty.");
					ti.state   = Pers_statusbar.STATE_NEUT;
					ti.tooltip = Perspectives.strbundle.getString("listOfNotariesIsEmpty");
				}
			} else {
				Pers_debug.d_print("main", uri.asciiHost + " doesn't need a request. Using cached results.");
				ti.is_cached = true;
				ti.state   = Pers_statusbar.STATE_NEUT;
				ti.tooltip = uri.asciiHost + " doesn't need a request. Using cached results."; // TODO: localization

				setTimeout(function() {
					Pers_debug.d_print("main", "Publish server_result_list in query_notaries_by_tabinfo_IO() cached.");
					ti.await_obj.publish_serverresultlist(ti.query_results.server_result_list);
				}, 0); // simulate asynchronous call to make behaviour consistent
			}

			return ret;
		},
		onSecurityChange    : function(aBrowser, aWebProgress, aRequest, aState) {
			Pers_debug.d_print("main", "onSecurityChange( " +
				"aBrowser"      + (aBrowser     != null ? ".currentURI=" + aBrowser.currentURI.asciiHost     : "=" + null)                                   + ", " +
				"aWebProgress"  + (aWebProgress != null ? ".currentURI=" + aWebProgress.currentURI.asciiHost : "=" + null)                                   + ", " +
				"aRequest"      + (aRequest     != null ? (aRequest.URI != null ? ".URI=" + aRequest.URI.asciiHost : ".name=" + aRequest.name) : "=" + null) + ", " +
				"aState="       + aState                                                                                                                     + ")"
			);

			if(Perspectives.strbundle == null) {
				Perspectives.strbundle = document.getElementById("notary_strings");
			}

			if(aWebProgress.currentURI != null && aWebProgress.currentURI.asciiHost !== "") {
				var uri = aWebProgress.currentURI;
				var ti = null;

				var redirect = _.findWhere(Perspectives.redirects, {webprogress : aWebProgress});
				if(redirect != null) {
					Perspectives.redirects.splice(_.indexOf(Perspectives.redirects, redirect), 1);
					ti = Perspectives.getCurrentTabInfo(redirect.uri);
					ti.service_id = Perspectives.getServiceId(uri);

					Pers_debug.d_print("main", "Redirect detected from " + ti.service_id_original + " to " + ti.service_id + ".");
				} else {
					ti = Perspectives.getCurrentTabInfo(uri);
				}

				try {
					if(uri.scheme === 'https') {
						// TODO (lambdor): the Perspectives.recentSSLStatus state variable can probably be removed and solved in a cleaner way.
						// This was just a dirty hotfix to make 4.6 work with FF33 again thus I leave it like this for now.
						// But as I see it we could just pass aWebProgress along and read the actual SSLStatus, removing getCertificate entirely.
						if(aRequest.securityInfo != null)
						{
							Perspectives.recentSSLStatus = aRequest.securityInfo.QueryInterface(Ci.nsISSLStatusProvider).SSLStatus;
						}

						// TODO: "there is a bug that causes getting the cert from another tab" => check if still the case
						var cert = Perspectives.getCertificate(aBrowser);
						if(cert) {
							ti.is_override_cert = Perspectives.overrideService.isCertUsedForOverrides(cert, true, true);

							// see if the browser has this cert installed prior to this browser session
							// seems like we can't tell the difference between an exception added by the user
							// manually and one we installed permanently during a previous browser run.
							ti.already_trusted = !(aBrowser.securityUI.state & Perspectives.state.STATE_IS_INSECURE) && !ti.is_override_cert;

							Pers_debug.d_print("main", "is_override_cert=" + ti.is_override_cert + ", already_trusted=" + ti.already_trusted);

							var is_whitelisted = Perspectives.is_whitelisted_by_user(uri.host);
							if(!is_whitelisted) {
								if(ti.await_obj == null) {
									// don't change the _.partial(Perspectives.process_results_main, ti) part
									// this will later be used for embedded content processing
									ti.await_obj = Perspectives.await_serverresultlist_and_cert(uri, _.partial(Perspectives.process_results_main, ti));
								}

								if(!ti.await_obj.is_stopped()) {
									var check_good = Perspectives.root_prefs.getBoolPref("perspectives.check_good_certificates");
									if(!check_good && !ti.already_trusted) {
										Pers_debug.d_print("main", "query_notaries_by_tabinfo_IO() in onSecurityChange() now that a certificate security error exists.");
										ti.state   = Pers_statusbar.STATE_QUERY;
										ti.tooltip = Perspectives.strbundle.getString("noProbeRequestedError");

										ti.query_publish_cert = Perspectives.notaryListener.query_notaries_by_tabinfo_IO(uri, ti, aBrowser);
									}

									Pers_debug.d_print("main", "Publish cert in onSecurityChange(). state is: " + ti.state);
									var security_state = aBrowser.securityUI.state;
									ti.await_obj.publish_cert(aBrowser, cert, security_state);

									var q_required = Perspectives.getQuorumAsInt();
									var required_duration = Perspectives.root_prefs.getIntPref("perspectives.required_duration");
									ti.query_publish_cert(cert, q_required, required_duration);
								}
							} else {
								Pers_debug.d_print("main", uri.asciiHost + " is whitelisted");
								ti.state   = Pers_statusbar.STATE_WHITELIST;
								ti.tooltip = Perspectives.strbundle.getFormattedString("configuredToWhitelistWithHost", [uri.asciiHost]);

								if(!ti.already_trusted && !ti.is_override_cert) {
									Pers_debug.d_print("main", "Override certificate security error.");
									var isTemp = !Perspectives.root_prefs.getBoolPref("perspectives.exceptions.permanent");

									setTimeout(function() {
										var flags = Perspectives.do_override(cert, uri, isTemp);
										if(flags) {
											Perspectives.setFaviconText(ti.tooltip);
											Pers_notify.do_notify(gBrowser, ti.last_banner_type, Pers_notify.TYPE_WHITELIST);
											ti.last_banner_type = Pers_notify.TYPE_WHITELIST;
											aBrowser.loadURIWithFlags(uri.spec, flags);
										}
									}, 0);
								}
							}
						} else {
							Pers_debug.d_print("main", "No certificate provided for " + uri.asciiHost);
							ti.state   = Pers_statusbar.STATE_NEUT;
							ti.tooltip = Perspectives.strbundle.getFormattedString("noCertError", [uri.asciiHost]);
						}
					} else {
						Pers_debug.d_print("main", uri.asciiHost + " has non-HTTPS scheme '" + uri.scheme + "', so don't query.");
						ti.state   = Pers_statusbar.STATE_NEUT;
						ti.tooltip = Perspectives.strbundle.getFormattedString("nonHTTPSError", [uri.asciiHost, uri.scheme]);
					}
				} catch(err) {
					ti.state   = Pers_statusbar.STATE_ERROR;
					ti.tooltip = Perspectives.strbundle.getFormattedString("internalError", ["onSecurityChange - " + err]);
				}

				Pers_debug.d_print("main", "Set status in onSecurityChange().");
				Pers_statusbar.setStatus(ti.state, ti.tooltip);
			}
		},
		onStateChange       : function(aBrowser, aWebProgress, aRequest, aStateFlags, aStatus) {
			Pers_debug.d_print("main", "onStateChange   ( " +
				"aBrowser"     + (aBrowser     != null ? ".currentURI=" + aBrowser.currentURI.asciiHost     : "=" + null)                                                      + ", " +
				"aWebProgress" + (aWebProgress != null ? ".currentURI=" + aWebProgress.currentURI.asciiHost : "=" + null)                                                      + ", " +
				"aRequest"     + (aRequest     != null ? (aRequest.URI != null ? ".URI=" + aRequest.URI.asciiHost : ".name=" + aRequest.name) : "=" + null)                    + ", " +
				"aStateFlags=" + (aStateFlags & Ci.nsIWebProgressListener.STATE_START ? "START" : (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP ? "STOP" : aStateFlags)) + ", " +
				"aStatus="     + aStatus                                                                                                                                       + ")"
			);

			if(aRequest.URI != null && aRequest.URI.asciiHost !== "") {
				var uri = aRequest.URI;
				var ti = Perspectives.getCurrentTabInfo(uri);

				if(aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
					if(Perspectives.strbundle == null) {
						Perspectives.strbundle = document.getElementById("notary_strings");
					}

					try {
						if(uri.scheme === 'https') {
							var is_routed = !Perspectives.is_nonrouted_ip(uri.host);
							if(is_routed) {
								var is_whitelisted = Perspectives.is_whitelisted_by_user(uri.host);
								if(!is_whitelisted) {
									if(ti.await_obj == null) {
										var query_immediately = Perspectives.root_prefs.getBoolPref("perspectives.check_good_certificates");
										if(query_immediately) {
											// don't change the _.partial(Perspectives.process_results_main, ti) part
											// this will later be used for embedded content processing
											ti.await_obj = Perspectives.await_serverresultlist_and_cert(uri, _.partial(Perspectives.process_results_main, ti));

											Perspectives.redirects.push({webprogress: aWebProgress, uri: uri});

											// only query when no await_obj exists
											// otherwise this would trigger an infinite loop of do_override -> onStateChange events
											// if the site has been verified before
											Pers_debug.d_print("main", "query_notaries_by_tabinfo_IO() in onStateChange().");
											ti.query_publish_cert = Perspectives.notaryListener.query_notaries_by_tabinfo_IO(uri, ti, aBrowser);
										} else {
											Pers_debug.d_print("main", "Don't query notaries already because user preference is set to wait for certificate security error.");
											ti.state   = Pers_statusbar.STATE_NEUT;
											ti.tooltip = Perspectives.strbundle.getString("noProbeRequestedError");
										}
									} else {
										Pers_debug.d_print("main", "Query notaries already started so don't query again.");
										// leave state and tooltip untouched
									}
								} else {
									Pers_debug.d_print("main", uri.asciiHost + " is whitelisted. Certificate security error will be overriden once we retrieved the cert in onSecurityChange.");
									ti.state   = Pers_statusbar.STATE_WHITELIST;
									ti.tooltip = Perspectives.strbundle.getFormattedString("configuredToWhitelistWithHost", [uri.asciiHost]);
								}
							} else {
								Pers_debug.d_print("main", uri.asciiHost + " is not a non-routed IP (intranet).");
								ti.state   = Pers_statusbar.STATE_NEUT;
								ti.tooltip = Perspectives.strbundle.getFormattedString("rfc1918Error", [uri.asciiHost]);
							}
						} else {
							Pers_debug.d_print("main", uri.asciiHost + " has non-HTTPS scheme '" + uri.scheme + "', so don't query.");
							ti.state   = Pers_statusbar.STATE_NEUT;
							ti.tooltip = Perspectives.strbundle.getFormattedString("nonHTTPSError", [uri.asciiHost, uri.scheme]);
						}
					} catch(err) {
						Pers_debug.d_print("error", "Perspectives had an internal exception: " + err);
						ti.state   = Pers_statusbar.STATE_ERROR;
						ti.tooltip = Perspectives.strbundle.getFormattedString("internalError", ["onStateChange - " + err]);
					}

					Pers_debug.d_print("main", "Set status in onStateChange().");
					Pers_statusbar.setStatus(ti.state, ti.tooltip);
				} else if(aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
					if(ti.await_obj.is_stopped()) {
						ti.await_obj = null;
					}
				}
			}
		}
	},

	await_serverresultlist_and_cert: function(uri, process_callback) {
		return (function() {
			var server_result_list_ = null;
			var browser_            = null;
			var cert_               = null;
			var security_state_     = null;
			var is_stopped          = false;

			return { publish_serverresultlist: function(server_result_list) {
				if(!is_stopped) {
					if(server_result_list != null) {
						server_result_list_ = server_result_list;
					}

					if(server_result_list_ != null && browser_ != null && cert_ != null && security_state_ != null) {
						this.stop(); // TODO: for some reason onSecurityChange is called twice so only call once

						// publish_serverresultlist is already called as asynchronous request
						Pers_debug.d_print("main", "Calling notaryQueriesComplete() in publish_serverresultlist().");
						Perspectives.notaryQueriesComplete(uri, server_result_list_, cert_, _.partial(process_callback, browser_, security_state_));
					}
				}
			}, publish_cert: function(browser, cert, security_state) {
				if(!is_stopped) {
					if(browser != null && cert != null && security_state != null) {
						browser_ = browser;
						cert_ = cert;
						security_state_ = security_state;
					}

					if(server_result_list_ != null && browser_ != null && cert_ != null && security_state_ != null) {
						// this may call process_results_main within onSecurityChange which may override ti.state and ti.tooltip
						// thus make it asychnchronous
						// TODO: remove asynchronous call once UI changes are extracted from process_results_main
						this.stop();
						setTimeout(function() {
							Pers_debug.d_print("main", "Calling notaryQueriesComplete() in publish_cert().");
							Perspectives.notaryQueriesComplete(uri, server_result_list_, cert_, _.partial(process_callback, browser_, security_state_));
						}, 0);
					}
				}
			}, stop: function() {
				Pers_debug.d_print("main", "Stopping awaitObj for " + uri );
				is_stopped = true;
			}, is_stopped: function() {
				return is_stopped;
			}
			};
		})();
	},

	initNotaries: function() {
		try {
			Pers_debug.d_print("main", "Perspectives Initialization");

			var auto_update = this.root_prefs.getBoolPref("perspectives.enable_default_list_auto_update");
			if(auto_update) {
				Pers_util.update_default_notary_list_from_web (this.root_prefs);
			} else {
				Pers_util.update_default_notary_list_from_file(this.root_prefs);
			}
			Pers_debug.d_print("main", _.pluck(Perspectives.getNotaryList(), "host").join("\n"));

			window.gBrowser.addTabsProgressListener(Perspectives.notaryListener);

			// https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Tabbed_browser#Notification_when_a_tab_is_added_or_removed
			window.gBrowser.tabContainer.addEventListener("TabOpen"  , function(event) {
				var uri = gBrowser.getBrowserForTab(event.target).currentURI;
				Pers_debug.d_print("main", "TabOpen '" + uri.asciiHost + "'");
				if(uri != null && uri.asciiHost !== "") {
					var ti = Perspectives.getCurrentTabInfo(uri);
					Pers_statusbar.setStatus(ti.state, ti.tooltip);
				} else {
					Pers_statusbar.setStatus(Pers_statusbar.STATE_NEUT);
				}
			});
			window.gBrowser.tabContainer.addEventListener("TabSelect", function(event) {
				var uri = gBrowser.getBrowserForTab(event.target).currentURI;
				Pers_debug.d_print("main", "TabSelect '" + uri.asciiHost + "'");
				if(uri != null && uri.asciiHost !== "") {
					var ti = Perspectives.getCurrentTabInfo(uri);
					Pers_statusbar.setStatus(ti.state, ti.tooltip);
				}
			}, false);

			Pers_debug.d_print("main", "Perspectives finished initialization.");
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
		// TODO: is this still true? -- lambdor
		try {
			var ignore = uri.host;
			if(!uri.host) {
				throw "";
			}
		} catch(e) {
			return Perspectives.strbundle.getString("notValidRemoteServer");
		}
		return null;
	},

	getCurrentTabInfo: function(uri) {
		var ti_cached = _.find(Perspectives.tab_info_cache, function(ti) {
			var service_id = Perspectives.getServiceId(uri);
			return (ti.service_id === service_id || ti.service_id_original === service_id);
		});

		var ti = {};
		if(ti_cached) {
			ti = ti_cached;
		} else {
			// defaults
			ti.is_override_cert    = false;
			ti.already_trusted     = false;
			ti.has_user_permission = false;
			ti.last_banner_type    = null;
			ti.state               = Pers_statusbar.STATE_NEUT;
			ti.tooltip             = "";
			ti.query_results       = null; // SslCert
			ti.await_obj           = null; // we can start querying already in onStateChange but still have to wait for cert in onSecurityChange
			ti.query_publish_cert  = null; // cert is not yet known in onStateChange but we stop querying when quorum is reached.
			ti.service_id          = Perspectives.getServiceId(uri);
			ti.service_id_original = ti.service_id; // in case of redirect
			Perspectives.tab_info_cache.push(ti);
		}
		return ti;
	},

	force_status_update: function(browser) {
		if(Perspectives.strbundle == null) {
			Perspectives.strbundle = document.getElementById("notary_strings");
		}

		var uri = browser.currentURI;
		var error_text = Perspectives.detectInvalidURI(uri);
		if(error_text) {
			Pers_util.pers_alert(Perspectives.strbundle.getString("invalidURI") + " (" + error_text + ")");
			return;
		}
		var ti = Perspectives.getCurrentTabInfo(uri);
		if(ti) {
			Pers_debug.d_print("main", "Forced request, clearing cache for '" + uri.asciiHost + "'");
			ti.has_user_permission = true; // forcing a check is implicit permission
			ti.query_results       = null;
			ti.is_cached           = false;

			ti.state   = Pers_statusbar.STATE_QUERY;
			ti.tooltip = Perspectives.strbundle.getFormattedString("contactingNotariesAbout", [uri.asciiHost]);
			Pers_debug.d_print("main", "Set status in force_status_update().");
			Pers_statusbar.setStatus(ti.state, ti.tooltip);

			var cert = Perspectives.getCertificate(browser);
			var security_state = browser.securityUI.state;

			if(ti.await_obj != null) {
				ti.await_obj.stop();
			}
			ti.await_obj = Perspectives.await_serverresultlist_and_cert(uri, _.partial(Perspectives.process_results_main, ti));
			ti.await_obj.publish_cert(browser, cert, security_state);
			ti.query_publish_cert = Perspectives.queryNotaries(uri, Perspectives.getNotaryList(), ti.await_obj.publish_serverresultlist);

			var q_required = Perspectives.getQuorumAsInt();
			var required_duration = Perspectives.root_prefs.getIntPref("perspectives.required_duration");
			ti.query_publish_cert(cert, q_required, required_duration);
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
