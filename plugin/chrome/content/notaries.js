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
	ssl_cache : new Object(),
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"]
					.getService(Components.interfaces.nsIPrefBranchInternal),
	overrideService : 
					Components.classes["@mozilla.org/security/certoverride;1"]
					.getService(Components.interfaces.nsICertOverrideService),
	
	// holds query reply data until all requests for a particular
	// service_id have either completed or timed-out.  
	// The key for this data is the service_id string.  
	// The data is a list of 'notary data' objects.  The object will be
	// empty in the case of an invalid signature or timeout
	query_result_data : {},

	state : {
		STATE_IS_BROKEN : 
			Components.interfaces.nsIWebProgressListener.STATE_IS_BROKEN,
		STATE_IS_INSECURE :
			Components.interfaces.nsIWebProgressListener.STATE_IS_INSECURE,
		STATE_IS_SECURE :
			Components.interfaces.nsIWebProgressListener.STATE_IS_SECURE
	},

	query_timeoutid_data : {},
 
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

	// if the tab changes to a webpage that has no notary
	// results, set the 'reason' property of this object to explain why.  
	// I use this hack b/c ssl_cache only caches info for sites we have
	// probed, wherease we want to communicate info to the status pop-up
	// about sites we haven't probed. 
	tab_info_cache : {}, 
	other_cache : {},

	clear_cache: function(){
		Perspectives.ssl_cache = new Object();
	},

	//Sets the tooltip and the text of the favicon popup on https sites
	setFaviconText: function(str){
		document.getElementById("identity-box").tooltipText = str;
	},

	getFaviconText: function(){
		return document.getElementById("identity-box").tooltipText;
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

	notifyOverride: function(b){
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
		var message = Perspectives.strbundle.getString("verificationSuccess");  
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
		var buttons = null;
		/* Uncomment when we have some sort of system
		 * var buttons = [{
		 *	label: Perspectives.strbundle.getString("reportThis"), 
		 *	accessKey : "", 
		 *	callback: function() {
		 * 		alert("Do Stuff");
		 *	}
		 * }];
		 */ 
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
					Perspectives.updateStatus(b,true,false); 
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
			label: Perspectives.strbundle.getString("firewallHelp"),
			accessKey : "", 
			callback: function() {
				b.loadOneTab(
					"chrome://perspectives_main/content/firewall.html", 
					null, null, null, false);
			} 
		}];
		notificationBox.appendNotification(message, "Perspectives", null,
				priority, buttons);
	},

	//certificate used in caching
	SslCert: function(host, port, md5, summary, tooltip, svg, duration, secure){
		this.host     = host;
		this.port     = port;
		this.md5      = md5;
		this.secure   = secure;
		this.duration = duration;
		this.summary  = summary;
		this.tooltip  = tooltip;
		this.svg      = svg;
	},

	get_invalid_cert_SSLStatus: function(uri){
		var recentCertsSvc = 
		Components.classes["@mozilla.org/security/recentbadcerts;1"]
			.getService(Components.interfaces.nsIRecentBadCertsService);
		if (!recentCertsSvc)
			return null;

		var port = uri.port; 
		if(port == -1) 
			port = 443; 

		var hostWithPort = uri.host + ":" + port;
		var gSSLStatus = recentCertsSvc.getRecentBadCert(hostWithPort);
		if (!gSSLStatus)
			return null;
		return gSSLStatus;
	},

	cert_from_SSLStatus: function(gSSLStatus){
		return gSSLStatus.QueryInterface(Components.interfaces.nsISSLStatus)
				.serverCert;
	},

	// gets current certificat, if it FAILED the security check 
	psv_get_invalid_cert: function(uri) { 
		var gSSLStatus = Perspectives.get_invalid_cert_SSLStatus(uri);
		if(!gSSLStatus){
			return null;
		}
		return this.cert_from_SSLStatus(gSSLStatus);
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


	queryNotaries: function(cert, uri,browser,has_user_permission){

		if(!cert) { 
			Pers_debug.d_print("error","No certificate found for: " + uri.host); 
			return null; 
		} 

		var port = uri.port; 
		if(port == -1) 
			port = 443; 
		var service_id = uri.host + ":" + port + ",2"; 
		
		if(Perspectives.query_result_data[service_id] != null) { 
			Pers_debug.d_print("main", 
				"already queried for '" + service_id + "', not querying again"); 
			return; 
		}

  
		// send a request to each notary
		
		Perspectives.query_result_data[service_id] = [];  
		for(i = 0; i < Perspectives.notaries.length; i++) { 
			var notary_server = Perspectives.notaries[i]; 
			var full_url = "http://" + notary_server.host + 
				"?host=" + uri.host + "&port=" + port + "&service_type=2&";
			Pers_debug.d_print("query", "sending query: '" + full_url + "'");
			var req  = XMLHttpRequest();
			req.open("GET", full_url, true);

			//NOTE: ugly, but we need to create a closure here, otherwise
			// the callback will only see the values for the final server
			req.onreadystatechange = (function(r,ns) { 
				return function(evt) { 
					Perspectives.notaryAjaxCallback(uri,cert, r, ns,service_id,
								browser,has_user_permission); 
				}
			})(req,notary_server);  
			req.send(null);
		}
    
		Perspectives.query_timeoutid_data[service_id] = 
			window.setTimeout(function () {
			try {  
			Pers_debug.d_print("query", "timeout querying " + service_id + " with results");
			var server_result_list = Perspectives.query_result_data[service_id];
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
			Perspectives.notaryQueriesComplete(uri,cert,service_id,browser,
					has_user_permission, 
					server_result_list);
			delete Perspectives.query_result_data[service_id]; 
			delete Perspectives.query_timeoutid_data[service_id];  
			} catch (e) { 
				Pers_debug.d_print("query", "error handling timeout"); 
				Pers_debug.d_print("query", e); 
			} 
			}, 
			Perspectives.TIMEOUT_SEC * 1000 
		); 

	}, 
        
 
	notaryAjaxCallback: function(uri, cert, req, notary_server,service_id,
				browser,has_user_permission) {  
	
		if (req.readyState == 4) {  
			if(req.status == 200){
				try { 
		 
					Pers_debug.d_print("query", req.responseText); 
					var server_node = req.responseXML.documentElement;
					var server_result = Pers_xml.
							parse_server_node(server_node,1);
					var bin_result = Pers_xml.
							pack_result_as_binary(server_result,service_id);
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
					
					var result_list = this.query_result_data[service_id]; 
					if(result_list == null) { 
						Pers_debug.d_print("query",
							"Query reply for '" + service_id + 
								"' has no query result data"); 
						return; 
					} 
				 	var i; 
					for(i = 0; i < result_list.length; i++) {
						if(result_list[i].server == server_result.server) { 
							Pers_debug.d_print("query", 
							  "Ignoring duplicate reply for '" + 
								service_id + "' from '" +
								server_result.server + "'"); 
							return; 
						} 
					}   
					Pers_debug.d_print("query","adding result from: " + 
							notary_server.host); 
					result_list.push(server_result); 
  					 
					var num_replies = this.query_result_data[service_id].length;
					Pers_debug.d_print("query", "num_replies = " + num_replies + 
								" total = " + Perspectives.notaries.length); 
					if(num_replies == Perspectives.notaries.length) { 
						Pers_debug.d_print("query","got all server replies"); 	
						Perspectives.notaryQueriesComplete(uri,cert,service_id,browser,
								has_user_permission, 
								Perspectives.query_result_data[service_id]);
						delete Perspectives.query_result_data[service_id];
						window.clearTimeout(Perspectives.
							query_timeoutid_data[service_id]);
						delete Perspectives.query_timeoutid_data[service_id];  
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

	notaryQueriesComplete: function(uri,cert,service_id,browser,
				has_user_permission,server_result_list) {
		try {
			var test_key = cert.md5Fingerprint.toLowerCase();
			// 2 days (FIXME: make this a pref)
			var max_stale_sec = 2 * 24 * 3600; 
			var q_thresh = Perspectives.root_prefs.
						getIntPref("perspectives.quorum_thresh") / 100;
			var q_required = Math.round(this.notaries.length * q_thresh);
			var unixtime = Pers_util.get_unix_time(); 
			var quorum_duration = Pers_client_policy.get_quorum_duration(test_key, 
					server_result_list, q_required, max_stale_sec,unixtime);  
			var is_consistent = quorum_duration != -1;
 
			var qd_days =  Math.round((quorum_duration / (3600 * 24)) * 1000) / 1000;
			var obs_text = ""; 
			for(var i = 0; i < server_result_list.length; i++) {
				obs_text += "\nNotary: " + server_result_list[i].server + "\n"; 
				obs_text += Pers_xml.resultToString(server_result_list[i]); 
			}  
			var qd_str = (is_consistent) ? qd_days + " days" : "none";
			var str = "Notary Lookup for: " + service_id + "\n";
    			str += "Browser's Key = '" + test_key + "'\n"; 
    			str += "Results:\n"; 
    			str += "Quorum duration: " + qd_str + "\n"; 
    			str += "Notary Observations: \n" + obs_text + "\n"; 
			Pers_debug.d_print("main","\n" + str + "\n");	
			var svg = Pers_gen.get_svg_graph(service_id, server_result_list, 30,
				unixtime,test_key);
			Pers_debug.d_print("main", svg);			
			Perspectives.ssl_cache[uri.host] = new Perspectives.SslCert(uri.host, 
										uri.port, test_key, 
										str, null,svg, qd_days, 
										is_consistent);
			Perspectives.process_notary_results(uri,browser,has_user_permission); 

		} catch (e) { 
			alert(e); 
		} 
	},

  
	// There is a bug here.  Sometimes it gets into a browser reload 
	// loop.  Come back to this later 

	do_override: function(browser, cert,isTemp) { 
		var uri = browser.currentURI;
		Pers_debug.d_print("main", "Do Override\n");

		gSSLStatus = Perspectives.get_invalid_cert_SSLStatus(uri);
		var flags = 0;
		if(gSSLStatus.isUntrusted)
			flags |= Perspectives.overrideService.ERROR_UNTRUSTED;
		if(gSSLStatus.isDomainMismatch)
			flags |= Perspectives.overrideService.ERROR_MISMATCH;
		if(gSSLStatus.isNotValidAtThisTime)
			flags |= Perspectives.overrideService.ERROR_TIME;

		Perspectives.overrideService.rememberValidityOverride(
			uri.asciiHost, uri.port, cert, flags, isTemp);

		setTimeout(function (){ 
			browser.loadURIWithFlags(uri.spec, flags);}, 25);
			return true;
	},


	// Updates the status of the current page 
	//Make this a bit more efficient when I get a chance
	// 'has_user_permission' indicates whether the user
	// explicitly pressed a button to launch this query,
	// by default this is not the case
	updateStatus: function(browser, has_user_permission, is_forced){

		if(Perspectives.strbundle == null) 
			Perspectives.strbundle = document.getElementById("notary_strings");

		Pers_debug.d_print("main", "Update Status\n");
		if(!browser){
			Pers_debug.d_print("error","No Browser!!\n");
			return;
		}
  
		var uri = browser.currentURI;
  
		if(!uri) { 
			var text = Perspectives.strbundle.getString("noDataError"); 
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text;
			return;
		}

		try { 
			var ignore = uri.host; 
		} catch(e) {
			var text = "URL is not a valid remote server"; 
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text;
			return;
		}
 
		if(!uri.host){
			return;
		}
  
		var ti = Perspectives.tab_info_cache[uri.spec]; 
		if(!ti) { 
			ti = {}; 
			Perspectives.tab_info_cache[uri.spec] = ti; 
		}
  
		Pers_debug.d_print("main", "Update Status: " + uri.spec + "\n");

		if(uri.scheme != "https"){
			var text = Perspectives.strbundle.
				getFormattedString("nonHTTPSError", [ uri.host, uri.scheme ]);
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text;
			return;
		} 
		
		// Note: we no longer do a DNS look-up to to see if a DNS name maps 
		// to an RFC 1918 address, as this 'leaked' DNS info for users running
		// anonymizers like Tor.  It was always just an insecure guess anyway.  
		var unreachable = Perspectives.is_nonrouted_ip(uri.host); 
		if(unreachable) { 
			var text = Perspectives.strbundle.
				getFormattedString("rfc1918Error", [ uri.host ])
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text; 
			return;
		} 

		ti.insecure         = false;
		ti.cert       = Perspectives.getCertificate(browser);
		if(!ti.cert){
			var text = Perspectives.strbundle.
				getFormattedString("noCertError", [ uri.host ])
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text; 
			return;
		}
  
		var md5        = ti.cert.md5Fingerprint.toLowerCase();
		ti.state      = browser.securityUI.state;
		var gSSLStatus = null;

		ti.is_override_cert = Perspectives.overrideService.
			isCertUsedForOverrides(ti.cert, true, true);
		Pers_debug.d_print("main", 
			"is_override_cert = " + ti.is_override_cert + "\n"); 
		var check_good = Perspectives.root_prefs.
			getBoolPref("perspectives.check_good_certificates"); 

		if(ti.state & Perspectives.state.STATE_IS_SECURE) { 
			Pers_debug.d_print("main", 
				"clearing any existing permission banners\n"); 
			Perspectives.clear_existing_banner(browser, 
				"Perspecives-Permission"); 
		}

		// see if the browser has this cert installed prior to this browser session
		ti.already_trusted = (ti.state & Perspectives.state.STATE_IS_SECURE) && 
			!(ti.is_override_cert && Perspectives.ssl_cache[uri.host]); 
		if(!check_good && ti.already_trusted && !is_forced) {
			var text = Perspectives.strbundle.
				getString("noProbeRequestedError"); 
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text; 
			return;
		} 

		if(!ti.is_override_cert && 
			ti.state & Perspectives.state.STATE_IS_INSECURE){
			Pers_debug.d_print("main",
				"state is STATE_IS_INSECURE, we need an override\n");
			ti.insecure = true; 
		}

		var cached_data = Perspectives.ssl_cache[uri.host];
		if(cached_data && cached_data.md5 != md5) { 
			Pers_debug.d_print("main", "Current and cached key disagree.  Re-evaluate security."); 
			delete Perspectives.ssl_cache[uri.host]; 
			cached_data = null; 
		}   
		
		//Update ssl cache cert
		ti.firstLook = false;
		if(!cached_data) { 
			ti.firstLook = true;
			Pers_debug.d_print("main", uri.host + " needs a request\n"); 
			var needs_perm = Perspectives.root_prefs
					.getBoolPref("perspectives.require_user_permission"); 
			if(needs_perm && !has_user_permission) {
				Pers_debug.d_print("main", "needs user permission\n");  
				Perspectives.notifyNeedsPermission(browser);
				var text = Perspectives.strbundle.getString("needsPermission"); 
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
				Perspectives.other_cache["reason"] = text;  
				return; 
			} 
    
			Pers_debug.d_print("main", "Contacting notaries\n"); 
			// this call is asynchronous.  after hearing from the 
			// notaries, the logic picks up again with the function 
			// 'done_querying_notaries()' below
			this.queryNotaries(ti.cert, uri,browser,has_user_permission);
		}else {
			Perspectives.process_notary_results(uri,browser,has_user_permission); 
		}
	},

	process_notary_results: function(uri,browser,has_user_permission) {  
		try { 
 
			var ti = Perspectives.tab_info_cache[uri.spec]; 
			ti.notary_valid = false; // default 
			cache_cert = Perspectives.ssl_cache[uri.host];
			if(!ti.insecure && !cache_cert.identityText &&
				Perspectives.getFaviconText().indexOf("Perspectives") < 0){
				cache_cert.identityText = 
					Perspectives.setFaviconText(Perspectives.getFaviconText() +
					"\n\n" + "Perspectives has validated this site");
			}
			var required_duration   = 
				Perspectives.root_prefs.
					getIntPref("perspectives.required_duration");

			if (cache_cert.summary.indexOf("ssl key") == -1) { 
				cache_cert.tooltip = 
					Perspectives.strbundle.getString("noRepliesWarning");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC, 
					cache_cert.tooltip);
				if(ti.insecure) { 
					Perspectives.notifyNoReplies(browser); 
				} 
			} else if(!cache_cert.secure){
				cache_cert.tooltip = 
					Perspectives.strbundle.getString("inconsistentWarning");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC, 
					cache_cert.tooltip);
				if(ti.insecure && ti.firstLook){
					Perspectives.notifyFailed(browser);
				}
			} else if(cache_cert.duration < required_duration){
				cache_cert.tooltip = Perspectives.strbundle.
					getFormattedString("thresholdWarning", 
					[ cache_cert.duration, required_duration]);
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC, 
					cache_cert.tooltip);
				if(ti.insecure && ti.firstLook){
					Perspectives.notifyFailed(browser);
				}
			}
			else { //Its secure


				// Check if this site includes insecure embedded content.  If so, do not 
				// show a green check mark, as we don't want people to incorrectly assume 
				// that we imply that the site is secure.  Note: we still will query the 
				// notary and will override an error page.  This is inline with the fact 
				// that Firefox still shows an HTTPS page with insecure content, it
				// just does not show positive security indicators.  
				if(ti.state & Perspectives.state.STATE_IS_BROKEN) { 
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, 
					"HTTPS Certificate is trusted, but site contains insecure embedded content. ");
				}  else { 

					ti.notary_valid = true; 
					cache_cert.tooltip = Perspectives.strbundle.
						getFormattedString("verifiedMessage", 
						[ cache_cert.duration, required_duration]);
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_SEC, 
						cache_cert.tooltip);
					if (ti.insecure){
						ti.insecure = false;
						ti.exceptions_enabled = Perspectives.root_prefs.
							getBoolPref("perspectives.exceptions.enabled")
						if(ti.exceptions_enabled) { 
							ti.isTemp = !Perspectives.root_prefs.
								getBoolPref("perspectives.exceptions.permanent");
							Perspectives.do_override(browser, ti.cert, ti.isTemp);
							cache_cert.identityText = Perspectives.strbundle.
								getString("exceptionAdded");  
							// don't give drop-down if user gave explicit
							// permission to query notaries
							if(ti.firstLook && !has_user_permission){
								Perspectives.notifyOverride(browser);
							}
						}
					}
				}
			}
		

			if(cache_cert.identityText){
				Perspectives.setFaviconText(cache_cert.identityText);
			}

 
		} catch (err) {
			alert("done_querying_notaries error: " + err);
		}
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
							"Connecting to " + aURI.spec);
      			} catch(err){
        			Pers_debug.d_print("error", "Perspectives had an internal exception: " + err);
        			Pers_statusbar.setStatus(aURI, Pers_statusbar.STATE_ERROR, 
					"Perspectives: an internal error occurred: " + err);
      			}

   		},

   		// we only call updateStatus on STATE_STOP, as a catch all in case
   		// onSecurityChange was never called. 
   		onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {
     			if(aFlag & STATE_STOP){
       			  try {
     				var uri = gBrowser.currentURI;
     				Pers_debug.d_print("main", "State change " + uri.spec + "\n");
         			Perspectives.updateStatus(gBrowser,false,false);
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
         			uri = gBrowser.currentURI;
         			Pers_debug.d_print("main", "Security change " + uri.spec + "\n");
         			Perspectives.updateStatus(gBrowser,false,false);
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
		var num = b.browsers.length;
		for (var i = 0; i < num; i++) {
			var browser = b.getBrowserAtIndex(i);
			Perspectives.updateStatus(browser, false,false);
		}
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
		Pers_debug.d_print("main", "\nPerspectives Initialization\n");
		Perspectives.fillNotaryList(); 
		Pers_statusbar.setStatus(null, Pers_statusbar.STATE_NEUT, "");
		getBrowser().addProgressListener(Perspectives.notaryListener, 
			Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
		setTimeout(function (){ Perspectives.requeryAllTabs(gBrowser); }, 4000);
		Pers_debug.d_print("main", "Perspectives Finished Initialization\n\n");
	}, 

	forceStatusUpdate : function(browser) { 
		var uri = browser.currentURI;
		if(uri && uri.host) { 		
			Pers_debug.d_print("main", "Forced request, clearing cache for '" + uri.host + "'"); 
			delete Perspectives.ssl_cache[uri.host];  
			Perspectives.updateStatus(browser, true, true); 
		} else { 
			Pers_debug.d_print("main", "Requested force check, but no URI is found"); 
		} 
	} 

}

Perspectives.other_cache["debug"] = ""; 
