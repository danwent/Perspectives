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
	root_prefs: Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefBranch),

	disable_quorum_text: function(is_disabled) {
		document.getElementById("quorum-thresh-text").disabled=is_disabled;
		document.getElementById("quorum-duration-text").disabled=is_disabled;
	},

	disable_reminder_box: function() {
		// enable or disable the sub-checkbox based on the value of the parent
		var checked = document.getElementById("require-user-permission-checkbox").checked;
		document.getElementById("show-permission-reminder-checkbox"        ).disabled = !checked;
	},

	menuset: function(qu, du) {
		Pers_pref.disable_quorum_text(true);
		document.getElementById("quorum-thresh").value = qu;
		document.getElementById("quorum-duration").value = du;
	},

	security_class_change: function() {
		var setting  = document.getElementById("secset").value;

		switch (parseInt(setting, 10)) {
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

	// https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsITreeView
	// https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/Tutorial/Custom_Tree_Views
	whitelist_treeView: {
		rows      : [],   // [{domain: string, host_regex: string, enabled: bool}]
		selection : null, // nsITreeSelection

		init: function(whitelist_enabled_str, whitelist_disabled_str) {
			var whitelist_enabled  = whitelist_enabled_str.length  > 0 ? whitelist_enabled_str.split (",") : [];
			var whitelist_disabled = whitelist_disabled_str.length > 0 ? whitelist_disabled_str.split(",") : [];

			var push_host_regexes = function(host_regexes, enabled, rows) {
				host_regexes.forEach(function(host_regex) {
					// TODO: support better subdomain handling in UI
					var host_prefix = "\\.";
					var domain = host_regex.substring(host_regex.indexOf(host_prefix) + host_prefix.length, host_regex.length - 1).replace(host_prefix, ".");

					rows.push({domain: domain, host_regex: host_regex, enabled: enabled});
				});
			};

			this.rows = [];
			push_host_regexes(whitelist_enabled , true , this.rows);
			push_host_regexes(whitelist_disabled, false, this.rows);

			this.rows.sort(function(a, b) {
				return a.domain.localeCompare(b.domain);
			});
		},
		serialize: function() {
			var whitelist_enabled  = [];
			var whitelist_disabled = [];
			this.rows.forEach(function(row) {
				if(row.enabled) {
					whitelist_enabled.push (row.host_regex);
				} else {
					whitelist_disabled.push(row.host_regex);
				}
			});

			return [ {pref: "perspectives.whitelist"                    , value: whitelist_enabled .join(",")}
				   , {pref: "extensions.perspectives.whitelist_disabled", value: whitelist_disabled.join(",")}
				   ];
		},
		removeSelected: function() {
			if(this.selection.getRangeCount() > 0) {
				var new_rows = [];
				var copy_idx = 0;

				for(var i = 0; i < this.selection.getRangeCount(); i++) {
					var min = {};
					var max = {};
					this.selection.getRangeAt(i, min, max);

					for(var j = copy_idx; j < min.value; j++) {
						new_rows.push(this.rows[j]);
					}
					copy_idx = max.value + 1;
				}

				// copy rest
				for(var j = copy_idx; j < this.rows.length; j++) {
					new_rows.push(this.rows[j]);
				}

				this.rows = new_rows;
			}
		},

		get rowCount() {
			return this.rows.length;
		},
		getCellText: function(row, col) {
			return this.rows[row][col.id];
		},
		setCellText: function(row, col, value) {
			this.rows[row][col.id] = value;
		},
		getCellValue: function(row, col) {
			return this.rows[row][col.id];
		},
		setCellValue: function(row, col, value) {
			this.rows[row][col.id] = value === "true";
		},
		cycleHeader: function(col) {
			if(col.id === "domain") {
				this.rows.reverse();
				var elem = document.getElementById("domain");
				var order = elem.getAttribute("sortDirection") !== "ascending";
				elem.setAttribute("sortDirection", order ? "ascending" : "descending");
			}
		},
		getLevel: function(row) {
			return 0;
		},
		getImageSrc: function(row, col) {
			return null;
		},
		isContainer: function(row) {
			return false;
		},
		isEditable: function(row, col) {
			return true;
		},
		isSeparator: function(row) {
			return false;
		},
		isSorted: function() {
			return true;
		},
		setTree: function(treebox) {
			this.treebox = treebox;
		}
	},

	// extra validation on some of the preference values
	save_button_clicked: function() {
		var ret = true;

		try {
			if(this.root_prefs.getIntPref("perspectives.required_duration") < 0) {
				this.root_prefs.setIntPref("perspectives.required_duration", 0);
			}
		} catch(e) {
			Pers_util.pers_alert(e);
			ret = false;
		}

		try {
			if(this.root_prefs.getIntPref("perspectives.quorum_thresh") < 1) {
				this.root_prefs.setIntPref("perspectives.quorum_thresh", 1);
			} else if(this.root_prefs.getIntPref("perspectives.quorum_thresh") > 100) {
				this.root_prefs.setIntPref("perspectives.quorum_thresh", 100);
			}
		} catch(e) {
			Pers_util.pers_alert(e);
			ret = false;
		}

		try {
			var whitelist_prefs = Pers_pref.whitelist_treeView.serialize();
			for(var i = 0; i < whitelist_prefs.length; i++) {
				this.root_prefs.setCharPref(whitelist_prefs[i].pref, whitelist_prefs[i].value);
			}
		} catch (e) {
			Pers_util.pers_alert(e);
			ret = false;
		}

		try {
			var add_list = document.getElementById("additional_notary_list");
			Pers_util.loadNotaryListFromString(add_list.value);
			window.close();
		} catch(e) {
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
				Pers_util.update_default_notary_list_from_web (this.root_prefs);
			} else {
				Pers_util.update_default_notary_list_from_file(this.root_prefs);
			}
			this.load_preferences();
		} catch(e) {
			Pers_util.pers_alert(e);
		}

	},

	load_preferences: function() {
		try {
			Pers_pref.security_class_change();
			Pers_pref.disable_reminder_box();

			var whitelist          = this.root_prefs.getCharPref("perspectives.whitelist");
			var whitelist_disabled = this.root_prefs.getCharPref("extensions.perspectives.whitelist_disabled");
			Pers_pref.whitelist_treeView.init(whitelist, whitelist_disabled);
			document.getElementById('whitelist').view = Pers_pref.whitelist_treeView;

			document.getElementById("default_notary_list").value = this.root_prefs.getCharPref("perspectives.default_notary_list");
		} catch(e) {
			Pers_util.pers_alert(e);
		}
	}
};

