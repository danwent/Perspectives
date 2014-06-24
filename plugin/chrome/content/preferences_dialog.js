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

var Pers_pref = {
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefBranch),

	disable_quorum_text: function(is_disabled) {
		document.getElementById("quorum-thresh-text").disabled=is_disabled;
		document.getElementById("quorum-duration-text").disabled=is_disabled;
	},

	disable_reminder_box: function() {
		// enable or disable the sub-checkbox based on the value of the parent
		var checked = document.getElementById("require-user-permission-checkbox").checked;
		document.getElementById("show-permission-reminder-checkbox"        ).disabled = !checked;
		document.getElementById("contact-in-private-browsing-mode-checkbox").disabled =  checked;
	},

	menuset: function(qu, du){
		Pers_pref.disable_quorum_text(true);
		document.getElementById("quorum-thresh").value = qu;
		document.getElementById("quorum-duration").value = du;
	},

	security_class_change: function() {
		var setting  = document.getElementById("secset").value;

		switch (parseInt(setting)){
		case 2:
			Pers_pref.menuset(75, 2);
			break;
		case 1:
			Pers_pref.menuset(75, 0);
			break;
		case 0:
			Pers_pref.menuset(50, 0);
			break;
		case -1:
			Pers_pref.disable_quorum_text(false);
			break;
		}

	},

	// extra validation on some of the preference values
	save_button_clicked: function() {
		var ret = true;

		try {
			if (this.root_prefs.getIntPref("perspectives.required_duration") < 0) {
				this.root_prefs.setIntPref("perspectives.required_duration", 0);
			}
		} catch (e) {
			Pers_util.pers_alert(e);
			ret = false;
		}
		try {
			if (this.root_prefs.getIntPref("perspectives.quorum_thresh") < 1) {
				this.root_prefs.setIntPref("perspectives.quorum_thresh", 1);
			} else if (this.root_prefs.getIntPref("perspectives.quorum_thresh") > 100) {
				this.root_prefs.setIntPref("perspectives.quorum_thresh", 100);
			}
		} catch (e) {
			Pers_util.pers_alert(e);
			ret = false;
		}
		try {
			var add_list = document.getElementById("additional_notary_list");
			var l = Pers_util.loadNotaryListFromString(add_list.value);
			window.close();
		} catch (e) {
			Pers_util.pers_alert(e);
			ret = false;
		}

		return ret;
	},

	auto_update_changed: function() {
		try {
			// Preferences are not necessarily updated at this point, so determine which
			// list to show based on whether the checkbox is selected.
			var auto_update = document.getElementById("enable_default_list_auto_update").checked;
			if(auto_update) {
				Pers_util.update_default_notary_list_from_web(this.root_prefs);
			} else {
				Pers_util.update_default_notary_list_from_file(this.root_prefs);
			}
			this.load_preferences();
		} catch(e) {
			Pers_util.pers_alert(e);
		}

	},

	load_preferences: function(){
		try {
			Pers_pref.security_class_change();
			Pers_pref.disable_reminder_box();
			var default_notary_text = this.root_prefs.getCharPref("perspectives.default_notary_list");
			document.getElementById("default_notary_list").value = default_notary_text;
		} catch(e) {
			Pers_util.pers_alert(e);
		}
	}
}

