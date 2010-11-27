var Perspectives = {
 	MY_ID: "perspectives@cmu.edu",
	TIMEOUT_SEC: 8, 
	strbundle : null, // this isn't loaded when things are intialized

	// FIXME: these regexes should be less generous
	nonrouted_ips : [ "^192\.168\.", "^10.", "^172\.1[6-9]\.", 
			"^172\.2[0-9]\.", "172\.3[0-1]\.", "^169\.254\.", 
			"^127\.0\.0\.1$"], // could add many more

	// list of objects representing each notary server's name + port and public
	// key this list is populated by fillNotaryList() based on a file shipped with the 
	// extension
	notaries : [],  

	// Data
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"]
					.getService(Components.interfaces.nsIPrefBranchInternal),
	overrideService : 
					Components.classes["@mozilla.org/security/certoverride;1"]
					.getService(Components.interfaces.nsICertOverrideService),
	
	state : {
		STATE_IS_BROKEN : 
			Components.interfaces.nsIWebProgressListener.STATE_IS_BROKEN,
		STATE_IS_INSECURE :
			Components.interfaces.nsIWebProgressListener.STATE_IS_INSECURE,
		STATE_IS_SECURE :
			Components.interfaces.nsIWebProgressListener.STATE_IS_SECURE
	},

	is_nonrouted_ip: function(ip_str) { 
		for each (regex in Perspectives.nonrouted_ips) { 
			if(ip_str.match(RegExp(regex))) { 
				return true; 
			}
		} 
		return false; 
	}, 


	// flag to make sure we only show component load failed alert once
	// per firefox session.  Otherwise, the user gets flooded with it.  
	show_component_failed : true,

	tab_info_cache : {}, 

	clear_cache: function(){
		Perspectives.tab_info_cache = {};  
	},

	//Sets the tooltip and the text of the favicon popup on https sites
	setFaviconText: function(str){
        var box = document.getElementById("identity-box");
        if(box)
            box.tooltipText = str;
        else { // SeaMonkey
            box = document.getElementById("security-button");
            if(box)
                box.tooltipText = str;
        }
	},

	getFaviconText: function(){
        var box = document.getElementById("identity-box");
        if(box)
            return box.tooltipText;
        // SeaMonkey
        box = document.getElementById("security-button");
        if(box)
            return box.tooltipText;
	},

	clear_existing_banner: function(b, value_text) { 
		try { 
			//Happens on requeryAllTabs

			try{
				var notificationBox = b.getNotificationBox();
			}
			catch(e){
				return;
			}
			var oldNotification = 
				notificationBox.getNotificationWithValue(value_text);
			if(oldNotification != null)
				notificationBox.removeNotification(oldNotification);
		} catch(err) { 
			Pers_debug.d_print("error","clear_existing_banner error: " + err); 	
		} 
	}, 

	notifyOverride: function(b,mixed_security){
		//Happens on requeryAllTabs

		try{
			var notificationBox = b.getNotificationBox();
		}
		catch(e){
			return;
		}
		var notificationBox = b.getNotificationBox();
		Perspectives.clear_existing_banner(b, "Perspectives"); 

		var priority = notificationBox.PRIORITY_INFO_LOW;
		var message = mixed_security ? "Perspectives has validated this website's certificate and bypassed Firefox's security error page.  However, this page contains insecure embedded content" :  Perspectives.strbundle.getString("verificationSuccess");
		var buttons = [{
			accessKey : "", 
			label: Perspectives.strbundle.getString("learnMore"), 
			accessKey : "", 
			callback: function() {
				b.loadOneTab("chrome://perspectives/locale/help.html", null, 
							 null, null, false);
			}
		}];
    
		notificationBox.appendNotification(message, "Perspectives", null,
										   priority, buttons);
	},
	
	notifyWhitelist: function(b){
		//Happens on requeryAllTabs

		try{
			var notificationBox = b.getNotificationBox();
		}
		catch(e){
			return;
		}
		var notificationBox = b.getNotificationBox();
		Perspectives.clear_existing_banner(b, "Perspectives"); 

		var priority = notificationBox.PRIORITY_INFO_LOW;
		var message = "You have configured Perspectives to whitelist connections to this website"; 
		var buttons = [
			{
			accessKey : "", 
			label: "Remove from Whitelist", 
			accessKey : "", 
			callback: function() {
				Pers_whitelist_dialog.remove_from_whitelist(b); 
			}
			}
		];
    
		notificationBox.appendNotification(message, "Perspectives", null,
										   priority, buttons);
	},

	notifyFailed: function(b){

		//Happens on requeryAllTabs

		try{
			var notificationBox = b.getNotificationBox();
		}
		catch(e){
			return;
		}
	
		var notificationBox = b.getNotificationBox();

		Perspectives.clear_existing_banner(b, "Perspectives"); 

		var priority = notificationBox.PRIORITY_CRITICAL_LOW;
		var message = Perspectives.strbundle.getString("unableToVerify");  
		var buttons = [{
		 	label: Perspectives.strbundle.getString("reportThis"), 
		 	accessKey : "", 
		 	callback: function() {
				Pers_report.report_attack(); 
		 	}
		  }, 
		  {
		 	label: "Whitelist", 
		 	accessKey : "", 
		 	callback: function() {
				Pers_whitelist_dialog.add_to_whitelist(); 
		 	}
		  }
		]; 
		notificationBox.appendNotification(message, "Perspectives", null,
										   priority, buttons);
	},

	// this is the drop down which is shown if preferences indicate
	// that notaries should only be queried with user permission
	notifyNeedsPermission: function(b){

		//Happens on requeryAllTabs 
		try{
			var notificationBox = b.getNotificationBox();
		}
		catch(e){
			return;
		}

		Perspectives.clear_existing_banner(b, "Perspectives-Permission"); 
		var priority = notificationBox.PRIORITY_WARNING_HIGH;
		var message = Perspectives.strbundle.getString("needsPermission");  
		var buttons = null;
		var buttons = [
			{
				label: Perspectives.strbundle.getString("yesContactNotaries"), 
				accessKey : "", 
				callback: function() {
					try { 

						//Happens on requeryAllTabs
						try{
							var notificationBox = b.getNotificationBox();
							}
						catch(e){
							return;
						}
	
						var nbox = b.getNotificationBox();
						nbox.removeCurrentNotification();
					} 
					catch (err) {
						// sometimes, this doesn't work.  why?
						// well, we'll just have to remove them all
						try { 
							nbox.removeAllNotifications();
							Pers_debug.d_print("main", 
									"successfully removed all notifications\n");
						} 
						catch (err2) { 
							Pers_debug.d_print("error",
									"probe_permission error2:" + err2 + "\n"); 
						} 
						Pers_debug.d_print("error",
								"probe_permission error1: " + err + "\n"); 
					} 
					// run probe
					Pers_debug.d_print("main", 
						"User gives probe permission\n"); 
					var uri = b.currentURI;
					Perspectives.updateStatus(window,true,false); 
				}
			},
			{ 
				label: Perspectives.strbundle.getString("learnMore"),
				accessKey : "", 
				callback: function() {
					b.loadOneTab("chrome://perspectives/locale/help.html", 
								 null, null, null, false);
				} 
			}
		];
  
		notificationBox.appendNotification(message, "Perspectives-Permission", 
										   null, priority, buttons);
	},

	// this is the drop down which is shown if the repsonse
	// receive no notary replies.  
	notifyNoReplies: function(b){
		try { 
		//Happens on requeryAllTabs 
		try {
			var notificationBox = b.getNotificationBox();
		}
		catch(e){
			return;
		}

		Perspectives.clear_existing_banner(b, "Perspectives-Permission"); 
		Perspectives.clear_existing_banner(b, "Perspectives"); 
		var priority = notificationBox.PRIORITY_CRITICAL_LOW;
		var message = Perspectives.strbundle.getString("noRepliesReceived");  
		var buttons = null;
		var buttons = [
		 {
		 	label: Perspectives.strbundle.getString("reportThis"), 
		 	accessKey : "", 
		 	callback: function() {
				Pers_report.report_attack(); 
		 	}
		  }, 
		  { 
			label: Perspectives.strbundle.getString("firewallHelp"),
			accessKey : "", 
			callback: function() {
				b.loadOneTab(
					"chrome://perspectives_main/content/firewall.html", 
					null, null, null, false);
			} 
		  }, 
		  {
		 	label: "Whitelist", 
		 	accessKey : "", 
		 	callback: function() {
				Pers_whitelist_dialog.add_to_whitelist(); 
		 	}
		  }
		];
		notificationBox.appendNotification(message, "Perspectives", null,
				priority, buttons);
		} catch(e) { 
			alert("notifyNoReplies error: " + e); 
		}
	},

	//certificate used in caching
	SslCert: function(host, port, md5, summary, tooltip, svg, duration, cur_consistent, 
					inconsistent_results,weakly_seen, server_result_list){
		this.host     = host;
		this.port     = port;
		this.md5      = md5;
		this.cur_consistent   = cur_consistent;
		this.inconsistent_results = inconsistent_results; 
		this.weakly_seen = weakly_seen, 
		this.duration = duration;
		this.summary  = summary;
		this.tooltip  = tooltip;
		this.svg      = svg;
		this.server_result_list = server_result_list; 
		this.created = Pers_util.get_unix_time(); 
	},

	get_invalid_cert_SSLStatus: function(uri){
		var recentCertsSvc = 
		Components.classes["@mozilla.org/security/recentbadcerts;1"]
			.getService(Components.interfaces.nsIRecentBadCertsService);
		if (!recentCertsSvc)
			return null;

		var port = (uri.port == -1) ? 443 : uri.port;  

		var hostWithPort = uri.host + ":" + port;
		var gSSLStatus = recentCertsSvc.getRecentBadCert(hostWithPort);
		if (!gSSLStatus)
			return null;
		return gSSLStatus;
	},

	// gets current certificat, if it FAILED the security check 
	psv_get_invalid_cert: function(uri) { 
		var gSSLStatus = Perspectives.get_invalid_cert_SSLStatus(uri);
		if(!gSSLStatus){
			return null;
		}
		return gSSLStatus.QueryInterface(Components.interfaces.nsISSLStatus)
				.serverCert;
	}, 

	// gets current certificate, if it PASSED the browser check 
	psv_get_valid_cert: function(ui) { 
		try { 
			ui.QueryInterface(Components.interfaces.nsISSLStatusProvider); 
			if(!ui.SSLStatus) 
				return null; 
			return ui.SSLStatus.serverCert; 
		}
		catch (e) {
			Pers_debug.d_print("error", "Perspectives Error: " + e); 
			return null;
		}
	}, 

	getCertificate: function(browser){
		var uri = browser.currentURI;
		var ui  = browser.securityUI;
		var cert = this.psv_get_valid_cert(ui);
		if(!cert){
			cert = this.psv_get_invalid_cert(uri);  
		}

		if(!cert) {
			return null;
		}
		return cert;
	},


	queryNotaries: function(ti,has_user_permission){
		if(!ti.cert) { 
			Pers_debug.d_print("error","No certificate found for: " + ti.uri.host); 
			return null; 
		} 

		if(ti.partial_query_results != null) { 
			Pers_debug.d_print("main", 
				"Query already in progress for '" + ti.uri.host + "' not querying again"); 
			return; 
		}

		var port = (ti.uri.port == -1) ? 443 : ti.uri.port;  
  
		// send a request to each notary
		
		ti.partial_query_results = [];  
		for(i = 0; i < Perspectives.notaries.length; i++) { 
			var notary_server = Perspectives.notaries[i]; 
			var full_url = "http://" + notary_server.host + 
				"?host=" + ti.uri.host + "&port=" + port + "&service_type=2&";
			Pers_debug.d_print("query", "sending query: '" + full_url + "'");
			var req  = XMLHttpRequest();
			req.open("GET", full_url, true);

			//NOTE: ugly, but we need to create a closure here, otherwise
			// the callback will only see the values for the final server
			req.onreadystatechange = (function(r,ns) { 
				return function(evt) { 
					Perspectives.notaryAjaxCallback(ti, r, ns, has_user_permission); 
				}
			})(req,notary_server);  
			req.send(null);
		}
    
		ti.timeout_id = window.setTimeout(function () {
			try {  
			Pers_debug.d_print("query", "timeout querying for '" + ti.uri.host + "' port " + port);
			var server_result_list = ti.partial_query_results;
			Pers_debug.d_print("query", server_result_list); 
 
			if (server_result_list == null) { 
				server_result_list = []; // may have been deleted between now and then
			}  
			for(var i = 0; i < Perspectives.notaries.length; i++) { 
				var found = false;
				for(var j = 0; j < server_result_list.length; j++) { 
					if(Perspectives.notaries[i].host == 
									server_result_list[j].server) { 
						found = true; 
						break; 
					}
				} 
				if(!found) { 
					// add empty result for this notary
					var res = { "server" : Perspectives.notaries[i].host, 
								"obs" : [] }; 
					server_result_list.push(res); 
				} 
			} 
			Perspectives.notaryQueriesComplete(ti, has_user_permission, server_result_list);
			} catch (e) { 
				Pers_debug.d_print("query", "error handling timeout"); 
				Pers_debug.d_print("query", e); 
			} 
			}, 
			Perspectives.TIMEOUT_SEC * 1000 
		); 

	}, 
        
 
	notaryAjaxCallback: function(ti, req, notary_server, has_user_permission) {  
	
		if (req.readyState == 4) {  
			if(req.status == 200){
				try { 							
 
					Pers_debug.d_print("query", req.responseText); 
					var server_node = req.responseXML.documentElement;
					var server_result = Pers_xml.
							parse_server_node(server_node,1);
					var bin_result = Pers_xml.
							pack_result_as_binary(server_result,ti.service_id);
					Pers_debug.d_print("query", 
						Pers_xml.resultToString(server_result,false)); 
					var verifier = 
						Cc["@mozilla.org/security/datasignatureverifier;1"].
							createInstance(Ci.nsIDataSignatureVerifier);
					var sig = server_result.signature; 		  
					var result = verifier.verifyData(bin_result, 
							server_result.signature, notary_server.public_key);
					if(!result) { 
						Pers_debug.d_print("error", "Invalid signature from : " + 
							notary_server.host); 
						return; 
					}
					server_result.server = notary_server.host; 
				
					var result_list = ti.partial_query_results; 
					if(result_list == null) { 
						Pers_debug.d_print("query",
							"Query reply for '" + ti.service_id + 
								"' has no query result data"); 
						return; 
					} 
				 	var i; 
					for(i = 0; i < result_list.length; i++) {
						if(result_list[i].server == server_result.server) { 
							Pers_debug.d_print("query", 
							  "Ignoring duplicate reply for '" + 
								ti.service_id + "' from '" +
								server_result.server + "'"); 
							return; 
						} 
					}   
					Pers_debug.d_print("query","adding result from: " + 
							notary_server.host); 
					result_list.push(server_result); 
  					 
					var num_replies = ti.partial_query_results.length;
					Pers_debug.d_print("query", "num_replies = " + num_replies + 
								" total = " + Perspectives.notaries.length); 
					if(num_replies == Perspectives.notaries.length) { 
						Pers_debug.d_print("query","got all server replies"); 	
						window.clearTimeout(ti.timeout_id);
						Perspectives.notaryQueriesComplete(ti,
								has_user_permission, 
								ti.partial_query_results);
					}
					  
				} catch (e) { 
					Pers_debug.d_print("error", "exception: " + e); 
				} 
			} else { // HTTP ERROR CODE
				Pers_debug.d_print("error", 
					"HTTP Error code when querying notary");  
			}
		}  
	},  

	notaryQueriesComplete: function(ti, has_user_permission,server_result_list) {
		try {
			delete ti.partial_query_results; 
			delete ti.timeout_id; 
			
			var test_key = ti.cert.md5Fingerprint.toLowerCase();
			// 2 days (FIXME: make this a pref)
			var max_stale_sec = 2 * 24 * 3600; 
			var q_thresh = Perspectives.root_prefs.
						getIntPref("perspectives.quorum_thresh") / 100;
			var q_required = Math.round(this.notaries.length * q_thresh);
			var unixtime = Pers_util.get_unix_time(); 
			var quorum_duration = Pers_client_policy.get_quorum_duration(test_key, 
					server_result_list, q_required, max_stale_sec,unixtime);  
			var is_cur_consistent = quorum_duration != -1;
		
	
			var weak_check_time_limit = Perspectives.root_prefs.
						getIntPref("perspectives.weak_consistency_time_limit");
			var inconsistent_check_max = Perspectives.root_prefs.
					getIntPref("perspectives.max_timespan_for_inconsistency_test");
			var is_inconsistent = Pers_client_policy.inconsistency_check(server_result_list,
							inconsistent_check_max, weak_check_time_limit);
			var weakly_seen = Pers_client_policy.key_weakly_seen_by_quorum(test_key, 
						server_result_list, q_required, weak_check_time_limit); 
				 
			var qd_days =  Math.round((quorum_duration / (3600 * 24)) * 1000) / 1000;
			var obs_text = ""; 
			for(var i = 0; i < server_result_list.length; i++) {
				obs_text += "\nNotary: " + server_result_list[i].server + "\n"; 
				obs_text += Pers_xml.resultToString(server_result_list[i]); 
			}  
			var qd_str = (is_cur_consistent) ? qd_days + " days" : "none";
			var str = "Notary Lookup for: " + ti.service_id + "\n";
    			str += "Browser's Key = '" + test_key + "'\n"; 
    			str += "Results:\n"; 
    			str += "Quorum duration: " + qd_str + "\n"; 
    			str += "Notary Observations: \n" + obs_text + "\n"; 
			//Pers_debug.d_print("main","\n" + str + "\n");	
			var svg = Pers_gen.get_svg_graph(ti.service_id, server_result_list, 30,
				unixtime,test_key);
			ti.query_results = new Perspectives.SslCert(ti.uri.host, 
										ti.uri.port, test_key, 
										str, null,svg, qd_days, 
										is_cur_consistent, 
										is_inconsistent, 
										weakly_seen, 
										server_result_list);
			Perspectives.process_notary_results(ti,has_user_permission); 

		} catch (e) { 
			alert(e); 
		} 
	},

  
	do_override: function(browser, cert,isTemp) { 
		var uri = browser.currentURI;
		Pers_debug.d_print("main", "Do Override\n");

		var gSSLStatus = Perspectives.get_invalid_cert_SSLStatus(uri);
		if(gSSLStatus == null) { 
			return false; 
		} 
		var flags = 0;
		if(gSSLStatus.isUntrusted)
			flags |= Perspectives.overrideService.ERROR_UNTRUSTED;
		if(gSSLStatus.isDomainMismatch)
			flags |= Perspectives.overrideService.ERROR_MISMATCH;
		if(gSSLStatus.isNotValidAtThisTime)
			flags |= Perspectives.overrideService.ERROR_TIME;

		Perspectives.overrideService.rememberValidityOverride(
			uri.asciiHost, uri.port, cert, flags, isTemp);

		setTimeout(function (){ browser.loadURIWithFlags(uri.spec, flags);}, 25);
		return true;
	},


	// Updates the status of the current page 
	//Make this a bit more efficient when I get a chance
	// 'has_user_permission' indicates whether the user
	// explicitly pressed a button to launch this query,
	// by default this is not the case
	updateStatus: function(win, has_user_permission, is_forced){

		if(Perspectives.strbundle == null) 
			Perspectives.strbundle = document.getElementById("notary_strings");

		Pers_debug.d_print("main", "Update Status\n");
		
		var error_text = Perspectives.detectInvalidURI(win); 
		if(error_text) { 	
			Pers_statusbar.setStatus(null, Pers_statusbar.STATE_NEUT, error_text);
			return; 
		} 
		var ti = Perspectives.getCurrentTabInfo(win);
		if(ti.uri.scheme != "https"){
			var text = Perspectives.strbundle.
				getFormattedString("nonHTTPSError", [ ti.uri.host, ti.uri.scheme ]);
			Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NEUT, text); 
			ti.reason_str = text;
			return;
		} 
		
		Pers_debug.d_print("main", "Update Status: " + ti.uri.spec + "\n");
		
		ti.cert       = Perspectives.getCertificate(ti.browser);
		if(!ti.cert){
			var text = Perspectives.strbundle.
				getFormattedString("noCertError", [ ti.uri.host ])
			Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NEUT, text); 
			ti.reason_str = text;
			return;
		}
  
		var md5        = ti.cert.md5Fingerprint.toLowerCase();
		ti.state      = ti.browser.securityUI.state;

		ti.is_override_cert = Perspectives.overrideService.
			isCertUsedForOverrides(ti.cert, true, true);
		Pers_debug.d_print("main", 
			"is_override_cert = " + ti.is_override_cert + "\n"); 
		var check_good = Perspectives.root_prefs.
			getBoolPref("perspectives.check_good_certificates"); 

		
		// see if the browser has this cert installed prior to this browser session
		// seems like we can't tell the difference between an exception we installed permemently 
		// during a previous browser run.  
		ti.already_trusted = !(ti.state & Perspectives.state.STATE_IS_INSECURE) && 
			!(ti.is_override_cert && ti.query_results); 
		
		if(Perspectives.is_whitelisted_by_user(ti.uri.host)) {
			if(!ti.already_trusted) { 		
				var isTemp = !Perspectives.root_prefs.getBoolPref("perspectives.exceptions.permanent");
				setTimeout(function() {  
					if(Perspectives.do_override(ti.browser, ti.cert, isTemp)) { 
						Perspectives.setFaviconText("Certificate trusted based on Perspectives whitelist"); 
						Perspectives.notifyWhitelist(ti.browser);
					}
				}, 1000); 
			} 
			var text = "You have configured Perspectives to whitelist connections to '" + 
									ti.uri.host  + "'";
			Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_SEC, text); 
			ti.reason_str = text;
			return; 
		} else { 

			// Note: we no longer do a DNS look-up to to see if a DNS name maps 
			// to an RFC 1918 address, as this 'leaked' DNS info for users running
			// anonymizers like Tor.  It was always just an insecure guess anyway.  
			var unreachable = Perspectives.is_nonrouted_ip(ti.uri.host); 
			if(unreachable) { 
				var text = Perspectives.strbundle.
					getFormattedString("rfc1918Error", [ ti.uri.host ])
				Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NEUT, text); 
				ti.reason_str = text;
				return;
			}
		}   

		if(!check_good && ti.already_trusted && !is_forced) {
			var text = Perspectives.strbundle.
				getString("noProbeRequestedError"); 
			Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NEUT, text); 
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
		if(ti.query_results && ti.query_results.md5 != md5) { 
			Pers_debug.d_print("main", "Current and cached key disagree.  Re-evaluate security."); 
			delete ti.query_results; 
		}   
		
		if(ti.query_results) { 
			Perspectives.process_notary_results(ti,has_user_permission,false);
		} else {  
			Pers_debug.d_print("main", ti.uri.host + " needs a request\n"); 
			var needs_perm = Perspectives.root_prefs
					.getBoolPref("perspectives.require_user_permission"); 
			if(needs_perm && !has_user_permission) {
				Pers_debug.d_print("main", "needs user permission\n");  
				Perspectives.notifyNeedsPermission(ti.browser);
				var text = Perspectives.strbundle.getString("needsPermission"); 
				Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NEUT, text); 
				ti.reason_str = text;
				return; 
			} 
    
			Pers_debug.d_print("main", "Contacting notaries\n"); 
			// this call is asynchronous.  after hearing from the 
			// notaries, the logic picks up again with the function 
			// 'process_notary_results()' below
			this.queryNotaries(ti,has_user_permission);
		}
	},

	process_notary_results: function(ti,has_user_permission) {  
		try {
			if(!ti.already_trusted && !ti.query_results.identityText &&
				Perspectives.getFaviconText().indexOf("Perspectives") < 0){
				ti.query_results.identityText = 
					Perspectives.setFaviconText(Perspectives.getFaviconText() +
					"\n\n" + "Perspectives has validated this site");
			}
			var required_duration   = 
				Perspectives.root_prefs.
					getIntPref("perspectives.required_duration");

			var strong_trust = ti.query_results.cur_consistent && 
						(ti.query_results.duration >= required_duration); 
			var pref_https_weak = Perspectives.root_prefs.
					getBoolPref("perspectives.trust_https_with_weak_consistency");
			var weak_trust = ti.query_results.inconsistent_results && ti.query_results.weakly_seen; 
	
			if(strong_trust) {
				var mixed_security =  ti.state & Perspectives.state.STATE_IS_BROKEN; 
				if(!ti.is_override_cert && (ti.state & Perspectives.state.STATE_IS_INSECURE)){
					ti.exceptions_enabled = Perspectives.root_prefs.
						getBoolPref("perspectives.exceptions.enabled")
					if(ti.exceptions_enabled) { 
						ti.override_used = true; 
						var isTemp = !Perspectives.root_prefs.
							getBoolPref("perspectives.exceptions.permanent");
						Perspectives.do_override(ti.browser, ti.cert, isTemp);
						ti.query_results.identityText = Perspectives.strbundle.
							getString("exceptionAdded");  
						// don't give drop-down if user gave explicit
						// permission to query notaries
						if(ti.firstLook && !has_user_permission){
							Perspectives.notifyOverride(ti.browser, mixed_security);
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
					Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NEUT, 
					"HTTPS Certificate is trusted, but site contains insecure embedded content. ");
					// this will flicker, as we can't rely on just doing it on 'firstLook'
					// due to firefox oddness
					if(ti.override_used) { 	
						Perspectives.notifyOverride(ti.browser, mixed_security);
					}
				}  else { 

					ti.query_results.tooltip = Perspectives.strbundle.
						getFormattedString("verifiedMessage", 
						[ ti.query_results.duration, required_duration]);
					Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_SEC, 
						ti.query_results.tooltip);
				}
			} else if(ti.already_trusted && weak_trust && pref_https_weak) { 
				if(ti.state & Perspectives.state.STATE_IS_BROKEN) { 
					Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NEUT, 
					"HTTPS Certificate is weakly trusted, but site contains insecure embedded content. ");
				}  else { 
					Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_SEC, 
					"This site uses multiple certificates, including the certificate received and trusted by your browser.");

				} 
			} else if (ti.query_results.summary.indexOf("ssl key") == -1) { 
				ti.query_results.tooltip = 
					Perspectives.strbundle.getString("noRepliesWarning");
				Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NSEC, 
					ti.query_results.tooltip);
				if(!ti.already_trusted) { 
					Perspectives.notifyNoReplies(ti.browser); 
				} 
			} else if(ti.query_results.inconsistent_results && !ti.query_results.weakly_seen) { 
				ti.query_results.tooltip = "This site regularly uses multiples certificates, and most Notaries have not recently seen the certificate received by the browser";
				Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NSEC, 
					ti.query_results.tooltip);
			} else if(ti.query_results.inconsistent_results) { 
				ti.query_results.tooltip = "Perspectives is unable to validate this site, because the site regularly uses multiples certificates"; 
				Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NSEC, 
					ti.query_results.tooltip);
			} else if(!ti.query_results.cur_consistent){
				ti.query_results.tooltip = 
					Perspectives.strbundle.getString("inconsistentWarning");
				Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NSEC, 
					ti.query_results.tooltip);
				// we may reconsider this in the future, but currently we don't do a 
				// drop-down if things aren't consistent but the browser already trusts the cert. 
				if(!ti.already_trusted && ti.firstLook){
					Perspectives.notifyFailed(ti.browser);
				}
			} else if(ti.query_results.duration < required_duration){
				ti.query_results.tooltip = Perspectives.strbundle.
					getFormattedString("thresholdWarning", 
					[ ti.query_results.duration, required_duration]);
				Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_NSEC, 
					ti.query_results.tooltip);
				if(!ti.already_trusted && ti.firstLook){
					Perspectives.notifyFailed(ti.browser);
				}
			} else { 
				ti.query_results.tooltip = "An unknown Error occurred processing Notary results";
				Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_ERROR, 
					ti.query_results.tooltip);
			} 
		

			if(ti.query_results.identityText){
				Perspectives.setFaviconText(ti.query_results.identityText);
			}

 
		} catch (err) {
			alert("process_notary_results error: " + err);
		}
	},

	is_whitelisted_by_user : function(host) {
		try { 
			/* be cautious in case we got a bad user edit to the whitelist */  
			var whitelist = Perspectives.root_prefs.
				    getCharPref("perspectives.whitelist").split(",");
			for(var entry in whitelist) {
				var e = whitelist[entry]; 
				if(e.length == 0) { 
					continue; 
				} 
				var r = RegExp(e);
				if (host.match(r)) {
					return true; 
				} 
			} 
		} catch(e) { /* ignore */ } 
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
	notaryListener : { 

   		// Note: We intentially do NOT call updateStatus from here, as this
   		// was causing a bug that caused us to get the previous website's cert
   		// instead of the correct cert.  
   		onLocationChange: function(aWebProgress, aRequest, aURI) {
      			try{
        			Pers_debug.d_print("main", "Location change " + aURI.spec + "\n");
        			Pers_statusbar.setStatus(aURI, Pers_statusbar.STATE_QUERY, 
							"Contacting notaries about '" + aURI.host + "'");
      			} catch(err){
        			Pers_debug.d_print("error", "Perspectives had an internal exception: " + err);
        			Pers_statusbar.setStatus(aURI, Pers_statusbar.STATE_ERROR, 
					"Perspectives: an internal error occurred: " + err);
      			}

   		},

   		// we only call updateStatus on STATE_STOP, as a catch all in case
   		// onSecurityChange was never called. 
   		onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {
     			
			if(aFlag & Components.interfaces.nsIWebProgressListener.STATE_STOP){
       			  try {
     				var uri = window.gBrowser.currentURI;
     				Pers_debug.d_print("main", "State change " + uri.spec + "\n");
         			Perspectives.updateStatus(window,false,false);
       			  } catch (err) {
         			Pers_debug.d_print("Perspectives had an internal exception: " + err);
         			Pers_statusbar.setStatus(Pers_statusbar.STATE_ERROR, 
					"Perspectives: an internal error occurred: " + err);
       			  }
     			}
  		},

  		// this is the main function we key off of.  It seems to work well, even though
  		// the docs do not explicitly say when it will be called. 
  		onSecurityChange:    function() {
       			var uri = null;
       			try{
         			uri = window.gBrowser.currentURI;
         			Pers_debug.d_print("main", "Security change " + uri.spec + "\n");
         			Perspectives.updateStatus(window,false,false);
       			} catch(err){
         			Pers_debug.d_print("error", "Perspectives had an internal exception: " + err);
         			if(uri) {
          				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_ERROR, 
						"Perspectives: an internal error occurred: " + err);
         			}
       			}
 
  		},

		onStatusChange:      function() { },
		onProgressChange:    function() { },
		onLinkIconAvailable: function() { }
	},



	requeryAllTabs: function(b){
		/*
		alert("requeryAllTabs is disabled"); 
		var num = b.browsers.length;
		for (var i = 0; i < num; i++) {
			var browser = b.getBrowserAtIndex(i);
			Perspectives.updateStatus(window, false,false);
		}
		*/ 
	},

	fillNotaryList: function() { 

       		var lines, i, notary_server, key;

        	lines = Pers_util.readLocalFileLines("http_notary_list.txt");
 
        	i = 0; 
        	while (i < lines.length) {  

            		notary_server = { "host" : lines[i] }; 
            		i += 1;

            		if (i >= lines.length || lines[i].indexOf("BEGIN PUBLIC KEY") === -1) { 
                		alert("Perspectives: invalid notary_list.txt file: " + lines[i]); 
                		return; 
            		}
            		i += 1;

            		key = ""; 
            		while (i < lines.length && lines[i].indexOf("END PUBLIC KEY") === -1) { 
                		key += lines[i]; 
                		i += 1;
            		}

            		i += 1; // consume the 'END PUBLIC KEY' line
            		notary_server.public_key = key; 
            		Perspectives.notaries.push(notary_server);  
        	} 
        	Pers_debug.d_print("main", Perspectives.notaries); 	
	},  
 
	initNotaries: function(){
		try { 
			Pers_debug.d_print("main", "\nPerspectives Initialization\n");
			Perspectives.fillNotaryList(); 
			Pers_statusbar.setStatus(null, Pers_statusbar.STATE_NEUT, "");
			getBrowser().addProgressListener(Perspectives.notaryListener, 
			Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
			setTimeout(function (){ Perspectives.requeryAllTabs(gBrowser); }, 4000);
			Pers_debug.d_print("main", "Perspectives Finished Initialization\n\n");
		} catch(e) { 
			alert("Error in initNotaries: " + e); 
		} 
	},

	detectInvalidURI : function(win) { 
		if(!win.gBrowser){
			Pers_debug.d_print("error","No Browser!!\n");
			return "No browser object found for this window";
		}
		
		var uri = win.gBrowser.currentURI; 
		if(!uri) { 
			return Perspectives.strbundle.getString("noDataError"); 
		}
		
		// sometimes things blow up because accessing uri.host throws an exception
		try { 
			var ignore = uri.host;
			if(!uri.host) throw "";  
		} catch(e) {
			return "URL is not a valid remote server"; 
		}
		return null; 
	}, 

	getCurrentTabInfo : function(win) { 
		var uri = win.gBrowser.currentURI; 
		var port = (uri.port == -1) ? 443 : uri.port;  
		var service_id = uri.host + ":" + port + ",2"; 

		var ti = Perspectives.tab_info_cache[service_id]; 
		if(!ti) {
			ti = {}; 
			ti.firstLook = true; 
			ti.override_used = false; 
			Perspectives.tab_info_cache[service_id] = ti; 
		}
		ti.uri = uri;
		ti.host = uri.host; 
		ti.service_id = service_id; 
		ti.browser = win.gBrowser; 
		ti.reason_str = "";
		return ti; 
	},  

	forceStatusUpdate : function(win) {
		var error_text = Perspectives.detectInvalidURI(win);  
		if(error_text) { 
			alert("Perspectives: Invalid URI (" + error_text + ")"); 
			return; 
		} 
		var ti = Perspectives.getCurrentTabInfo(win);
		if(ti) { 		
			Pers_debug.d_print("main", "Forced request, clearing cache for '" + ti.uri.host + "'"); 
			delete ti.query_results;  
			Perspectives.updateStatus(win, true, true); 
		} else { 
			Pers_debug.d_print("main", "Requested force check with valid URI, but no tab_info is found"); 
		} 
	}, 

	prompt_update: function() {
		var ask_update = Perspectives.root_prefs.
                getBoolPref("perspectives.prompt_update_all_https_setting");
		if (ask_update == true) {
			var check_good = Perspectives.root_prefs.
					getBoolPref("perspectives.check_good_certificates");
			if (!check_good) {
				var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
						.getService(Components.interfaces.nsIPromptService);
				var check = {value:false};
				var buttons = 
						prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING
						+ prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_IS_STRING;

				var answer = prompts.confirmEx(null, "Perspectives update", 
					"Thank you for using Perspectives. The default settings " +
					"have been updated to query the notary server for all " + 
					"HTTPS sites. Do you want to update this setting to use " +
					"the default or keep your current settings?", buttons, 
					"Update Settings", "Keep current settings", "", null, 
					check);
				if (answer == 0) {
					Perspectives.root_prefs.
						setBoolPref("perspectives.check_good_certificates", 
									true); 
				}
			}
			Perspectives.root_prefs.
					setBoolPref("perspectives.prompt_update_all_https_setting",
								false);
		}
	}
			
}

