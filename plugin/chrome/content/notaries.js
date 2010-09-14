var Perspectives = {
	MY_ID: "perspectives@cmu.edu",
	TIMEOUT_SEC: 8,
	strbundle : null, // this isn't loaded when things are intialized
	notary_debug : true,
	nonrouted_ips : [ "^192\.168\.", "^10.", "^172\.1[6-9]\.", 
			"^172\.2[0-9]\.", "172\.3[0-1]\.", "^169\.254\.", 
			"^127\.0\.0\.1$"], // could add many more

	// list of objects representing each notary server's name + port and public
	// key this list is populated by init_notarylist() 
	notaries : [],

	/* Data */
	whitelist : new Array(),
	ssl_cache : new Object(),
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"]
					.getService(Components.interfaces.nsIPrefBranchInternal),
	overrideService : 
					Components.classes["@mozilla.org/security/certoverride;1"]
					.getService(Components.interfaces.nsICertOverrideService),
	broken :false,

	// holds query reply data until all requests for a particular
	// service_id have either completed or timed-out.  
	// The key for this data is the service_id string.  
	// The data is a list of 'notary data' objects.  The object will be
	// empty in the case of an invalid signature or timeout
	query_result_data : {},

	state : {
		STATE_IS_BROKEN : 
			Components.interfaces.nsIWebProgressListener.STATE_IS_BROKE,
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

	getdns: function() {
		var cls = Components.classes['@mozilla.org/network/dns-service;1'];
		var iface = Components.interfaces.nsIDNSService;
		return cls.getService(iface);
	},


	// it is likely that all IPs are reachable, or none are,
	// but we are conservative and continue even if a single 
	// IP seems routable
	host_is_unreachable: function(hostname) {  
		var ip_str = "";
		var ips = Array();  
		var dns = this.getdns();
		var nsrecord = dns.resolve(hostname,true); 
		while (nsrecord && nsrecord.hasMore()) 
			ips[ips.length] = nsrecord.getNextAddrAsString(); 
		for each (ip_str in ips) { 
			if(!this.is_nonrouted_ip(ip_str)) { 
				return null; 
			}
			Pers_debug.d_print("main", "unreachable ip = " + ip_str + "\n");  
		}
		return ips; 
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
					Perspectives.updateStatus(b,true); 
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

	onWhitelist: function(host){
		//heard a rumor that this is O(n) sometimes
		var length = Perspectives.whitelist.length 
		for(var i = 0; i < length; i++){
			if(Perspectives.whitelist[i] == ""){//don't know why i need this
				continue;
			}
			if(host.indexOf(Perspectives.whitelist[i]) >= 0){
				Pers_debug.d_print("main",
					"whitelist match: " + Perspectives.whitelist[i] + "\n");
				return true;
			}
		}
		return false;
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
  
		// send a request to each notary

		if(Perspectives.query_result_data[service_id] != null) { 
			Pers_debug.d_print("main", 
				"already querying '" + service_id + "'.  Do not requery"); 
			return; 
		}

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
			Pers_debug.d_print("main", "timeout for " + service_id);
			var server_result_list = Perspective.query_result_data[service_id]; 
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
					if(Perspectives.query_result_data[service_id] == null) { 
						Pers_debug.d_print("query",
							"Query reply for '" + service_id + 
								"' has no query result data"); 
						return; 
					} 
					Pers_debug.d_print("query","adding result from: " + 
							notary_server.host); 
					this.query_result_data[service_id].push(server_result); 
 
					var num_replies = this.query_result_data[service_id].length;
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
			var quorum_duration = get_quorum_duration(test_key, 
					server_result_list, q_required, max_stale_sec,unixtime);  
			var is_consistent = quorum_duration != -1;
 
			var qd_days =  Math.
						round((quorum_duration / (3600 * 24)) * 1000) / 1000;
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
										uri.port,cert.md5Fingerprint, 
										str, null,svg, qd_days, 
										is_consistent);
			Perspectives.process_notary_results(uri,browser,has_user_permission); 

		} catch (e) { 
			alert(e); 
		} 
	},

  
	/* There is a bug here.  Sometimes it gets into a browser reload 
	 * loop.  Come back to this later */

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


	/* Updates the status of the current page */
	//Make this a bit more efficient when I get a chance
	// 'has_user_permission' indicates whether the user
	// explicitly pressed a button to launch this query,
	// by default this is not the case
	updateStatus: function(browser, has_user_permission){

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

		if(Perspectives.onWhitelist(uri.host)){
			var text = Perspectives.strbundle.
					getFormattedString("whitelistError", [uri.host] ); 
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text; 
			return;
		}
		var unreachable = Perspectives.host_is_unreachable(uri.host); 
		if(unreachable) { 
			var text = Perspectives.strbundle.
				getFormattedString("rfc1918Error", [ uri.host ])
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text; 
			return;
		} 

		ti.broken         = false;
		ti.cert       = Perspectives.getCertificate(browser);
		if(!ti.cert){
			var text = Perspectives.strbundle.
				getFormattedString("noCertError", [ uri.host ])
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text; 
			return;
		}
  
		var md5        = ti.cert.md5Fingerprint;
		var state      = browser.securityUI.state;
		var gSSLStatus = null;

		ti.is_override_cert = Perspectives.overrideService.
			isCertUsedForOverrides(ti.cert, true, true);
		Pers_debug.d_print("main", 
			"is_override_cert = " + ti.is_override_cert + "\n"); 
		var check_good = Perspectives.root_prefs.
			getBoolPref("perspectives.check_good_certificates"); 

		if(state & Perspectives.state.STATE_IS_SECURE) { 
			Pers_debug.d_print("main", 
				"clearing any existing permission banners\n"); 
			Perspectives.clear_existing_banner(browser, 
				"Perspecives-Permission"); 
		}

		// see if the browser has this cert installed prior to this browser session
		ti.already_trusted = (state & Perspectives.state.STATE_IS_SECURE) && 
			!(ti.is_override_cert && Perspectives.ssl_cache[uri.host]); 
		if(!check_good && ti.already_trusted) {
			var text = Perspectives.strbundle.
				getString("noProbeRequestedError"); 
			Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NEUT, text); 
			Perspectives.other_cache["reason"] = text; 
			return;
		} 

		if(!ti.is_override_cert && 
			state & Perspectives.state.STATE_IS_INSECURE){
			Pers_debug.d_print("main",
				"state is STATE_IS_INSECURE, we need an override\n");
			ti.broken = true; 
		}

		//Update ssl cache cert
		ti.firstLook = false;
		if(!Perspectives.ssl_cache[uri.host] || 
			Perspectives.ssl_cache[uri.host].md5 != md5){
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
			if(!ti.broken && !cache_cert.identityText &&
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
				if(ti.broken) { 
					Perspectives.notifyNoReplies(browser); 
				} 
			} else if(!cache_cert.secure){
				cache_cert.tooltip = 
					Perspectives.strbundle.getString("inconsistentWarning");
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC, 
					cache_cert.tooltip);
				if(ti.broken && ti.firstLook){
					Perspectives.notifyFailed(browser);
				}
			} else if(cache_cert.duration < required_duration){
				cache_cert.tooltip = Perspectives.strbundle.
					getFormattedString("thresholdWarning", 
					[ cache_cert.duration, required_duration]);
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_NSEC, 
					cache_cert.tooltip);
				if(ti.broken && ti.firstLook){
					Perspectives.notifyFailed(browser);
				}
			}
			else { //Its secure
				ti.notary_valid = true; 
				cache_cert.tooltip = Perspectives.strbundle.
					getFormattedString("verifiedMessage", 
					[ cache_cert.duration, required_duration]);
				Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_SEC, 
					cache_cert.tooltip);
				if (ti.broken){
					ti.broken = false;
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

			if(cache_cert.identityText){
				Perspectives.setFaviconText(cache_cert.identityText);
			}

			ti.broken = false;
 
		} catch (err) {
			alert("done_querying_notaries error: " + err);
		}
	},



	//note can use request to suspend the loading
	notaryListener : { 

		/* Note can use state is broken to listen if we need to do special stuff
		 * for redirecting */
		onLocationChange: function(aWebProgress, aRequest, aURI) {
			try{ 
				Pers_debug.d_print("main", 
					"Location change " + aURI.spec + "\n");
				Perspectives.updateStatus(gBrowser,false);
			} catch(err){
				Pers_debug.d_print("error", 
					"Perspectives had an internal exception: " + err);
				Pers_statusbar.setStatus(aURI, Pers_statusbar.STATE_ERROR, 
					"Perspectives: an internal error occurred: " + err); 
			} 
		},

		onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) { 
			var uri = gBrowser.currentURI;
			Pers_debug.d_print("main", "State change " + uri.spec + "\n");
			if(aFlag & Pers_statusbar.STATE_STOP){
				try { 
					Perspectives.updateStatus(gBrowser,false);
				} catch (err) { 
					Pers_debug.d_print("error", 
						"Perspectives had an internal exception: " + err);
					Pers_statusbar.setStatus(uri, Pers_statusbar.STATE_ERROR, 
						"Perspectives: an internal error occurred: " + err); 
				} 
			}
		},

		onSecurityChange:    function() { },
		onStatusChange:      function() { },
		onProgressChange:    function() { },
		onLinkIconAvailable: function() { }
	},

	init_whitelist: function(){
		var req = XMLHttpRequest();

		function parse(){ 
			if (req.readyState != 4){ 
				return;
			}
			Perspectives.whitelist = req.responseText.split("\n");
			for(var i = 0; i < Perspectives.whitelist.length; i++){
				Pers_debug.d_print("main", 
					"(" + Perspectives.whitelist[i] + ")" + "\n");
			}
		} 

		//Do it this way so we don't lag while our whitelist page loads
		try{
			req.open('GET', 'chrome://perspectives_main/content/whitelist.txt', 
				true);
			req.onreadystatechange = parse; 
			req.send(null);
		}
		catch(e){
			Pers_debug.d_print("error", e + "\n");
			return;
		}
	},

	init_notarylist: function(){
		var em = Components.classes["@mozilla.org/extensions/manager;1"].
			getService(Components.interfaces.nsIExtensionManager);
		var file = em.getInstallLocation(Perspectives.MY_ID).
			getItemFile(Perspectives.MY_ID, "http_notary_list.txt");
		var istream = Components.
			classes["@mozilla.org/network/file-input-stream;1"].
			createInstance(Components.interfaces.nsIFileInputStream);
		istream.init(file, 0x01, 0444, 0);
		istream.QueryInterface(Components.interfaces.nsILineInputStream);

		// read lines into array
		var line = {}, lines = [], hasmore;
		do {
			hasmore = istream.readLine(line);
			if (line.value.length > 0 && line.value[0] != "#") 
			lines.push(line.value); 
		} while(hasmore);

		istream.close();
   
		var i = 0; 
		while(i < lines.length) {  
			var notary_server = { "host" : lines[i++] }; 
			if(i >= lines.length || 
				lines[i++].indexOf("BEGIN PUBLIC KEY") == -1) { 
				alert("Perspectives: invalid notary_list.txt file: " + 
					lines[i - 1]); 
				return; 
			}
			var key = ""; 
			while(i < lines.length && 
				lines[i].indexOf("END PUBLIC KEY") == -1) { 
				key += lines[i++]; 
			}
			i++; // consume the 'END PUBLIC KEY' line
			notary_server["public_key"] = key; 
			Perspectives.notaries.push(notary_server);  
		} 
	},

	requeryAllTabs: function(b){
		var num = b.browsers.length;
		for (var i = 0; i < num; i++) {
			var browser = b.getBrowserAtIndex(i);
			Perspectives.updateStatus(browser, false);
		}
	},
 
	// Use Ajax to update the notary_list.txt file stored in the extension 
	// directory this is called on start-up  
	//NOTE: disabling auto-update of the notary list
	// b/c it could allow an attacker with a bogus root 
	// cert to compromise the system.  We should have this
	// update include a signature. 
	update_notarylist: function() { 
		try {
			var request = new XMLHttpRequest();
			request.open("GET","https://www.networknotary.org/notary_list.txt",
				true);
			request.onload = {
				handleEvent : 
				function(evt) {
					var psv_id = "perspectives@cmu.edu"; 
					var em = Components.
						classes["@mozilla.org/extensions/manager;1"].
						getService(Components.interfaces.nsIExtensionManager);
					var file = em.getInstallLocation(psv_id).
						getItemFile(psv_id, "notary_list.txt");
					// file is nsIFile, data is a string
					var t = request.responseText;
					Pers_debug.d_print("main", "updating notary list to:"); 
					Pers_debug.d_print("main", t);  
					var foStream = Components.
						classes["@mozilla.org/network/file-output-stream;1"].
						createInstance(Components.interfaces.
						nsIFileOutputStream);

					// use 0x02 | 0x10 to open file for appending.
					foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0); 
					foStream.write(t, t.length);
					foStream.close();
                }
			};
      
			request.onerror = {
				handleEvent : function(evt) {
					Pers_debug.d_print("error", 
						"failed to update notary_list.txt");
				}
			};

			request.send("");

		} catch (e) {
			Pers_debug.d_print("error", "error updating notary_list.txt: " + e);
		}
	}, 

	initNotaries: function(){
		Pers_debug.d_print("main", "\nPerspectives Initialization\n");
		Pers_statusbar.setStatus(null, Pers_statusbar.STATE_NEUT, "");
		Perspectives.init_notarylist(); 
		Perspectives.init_whitelist();
		getBrowser().addProgressListener(Perspectives.notaryListener, 
			Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
		setTimeout(function (){ Perspectives.requeryAllTabs(gBrowser); }, 4000);
		Pers_debug.d_print("main", "Perspectives Finished Initialization\n\n");

	}

}

Perspectives.other_cache["debug"] = ""; 
