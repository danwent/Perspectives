
var Pers_notify = {
	
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
	
	// generic notify function used by all other notify functions
	notifyGeneric: function(b, priority, message, buttons){
		//Happens on requeryAllTabs

		try{
			var notificationBox = b.getNotificationBox();
		}
		catch(e){
			return;
		}
		var notificationBox = b.getNotificationBox();
		this.clear_existing_banner(b, "Perspectives"); 

		notificationBox.appendNotification(message, "Perspectives", null, notificationBox[priority], buttons);
	},

	notifyOverride: function(b,mixed_security){

		var priority = "PRIORITY_INFO_LOW";
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
   		this.notifyGeneric(b, priority, message, buttons);  
	},
	
	notifyWhitelist: function(b){

		var priority = "PRIORITY_INFO_LOW";
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
   		this.notifyGeneric(b, priority, message, buttons);  
	},

	notifyFailed: function(b){
		var priority = "PRIORITY_CRITICAL_LOW";
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
   		this.notifyGeneric(b, priority, message, buttons);  
	},

	// this is the drop down which is shown if preferences indicate
	// that notaries should only be queried with user permission
	notifyNeedsPermission: function(b){
		var priority = "PRIORITY_WARNING_HIGH";
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
   		this.notifyGeneric(b, priority, message, buttons);  
	},

	// this is the drop down which is shown if the repsonse
	// receive no notary replies.  
	notifyNoReplies: function(b){
		var priority = "PRIORITY_CRITICAL_LOW";
		var message = Perspectives.strbundle.getString("noRepliesReceived");  
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
   		this.notifyGeneric(b, priority, message, buttons);  
	}

}

