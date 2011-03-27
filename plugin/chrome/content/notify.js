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


var Pers_notify = {

	// unique identifier for each notification
	// this is used to determine whether we need to 
	// show a notification, or whether it is a duplication
	// of the last notification we showed the user for that
	// website.  
	TYPE_OVERRIDE : 1, 
	TYPE_OVERRIDE_MIXED : 2, 
	TYPE_WHITELIST : 3, 
	TYPE_FAILED : 4, 
	TYPE_NEEDS_PERMISSION : 5,  
	TYPE_NO_REPLY : 6, 

	do_notify : function(ti, type) {
		if(ti.last_banner_type == type) { 
			return; 
		}
		ti.last_banner_type = type; 
		switch(type) { 
			case this.TYPE_OVERRIDE :
				this.notifyOverride(ti.browser, false); break; 
			case this.TYPE_OVERRIDE_MIXED :  
				this.notifyOverride(ti.browser, true); break; 
			case this.TYPE_WHITELIST : 
				this.notifyWhitelist(ti.browser); break; 
			case this.TYPE_FAILED : 
				this.notifyFailed(ti.browser); break; 
			case this.TYPE_NEEDS_PERMISSION : 
				this.notifyNeedsPermission(ti); break; 
			case this.TYPE_NO_REPLY : 
				this.notifyNoReply(ti.browser); break; 
			default: 
				Pers_debug.d_print("error", "Unknown notify type: " + type); 
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
	notifyNeedsPermission: function(ti){
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
							var notificationBox = ti.browser.getNotificationBox();
							}
						catch(e){
							return;
						}
	
						var nbox = ti.browser.getNotificationBox();
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
					try {  
						// run probe
						Pers_debug.d_print("main", "User gives probe permission\n"); 
						ti.has_user_permission = true;
        					Pers_statusbar.setStatus(ti.uri, Pers_statusbar.STATE_QUERY, 
							"Contacting notaries about '" + ti.uri.host + "'");
						Perspectives.updateStatus(window,false); 
					} catch (e) { 
						Pers_debug.d_print("main", "Error on UpdateStatus: " + e); 
					} 
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
   		this.notifyGeneric(ti.browser, priority, message, buttons);  
	},

	// this is the drop down which is shown if we receive no notary replies.  
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
	} 

}

