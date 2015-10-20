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

// This file contains initialization code that may be run when the extension starts
// It is held separately from initialize.xul to comply with Mozilla review policies

var Pers_init = {

    evtLoad: function(evt){
      Perspectives.init_data();
      Perspectives.initNotaries();
      var root_prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

      // call this *after* the document has loaded
      // so we have access to the stringbundle from statusbar.xul
      Perspectives.prompt_update();

      var firstrun = root_prefs.getBoolPref("extensions.perspectives.first_run");
      if (firstrun) {
          root_prefs.setBoolPref("extensions.perspectives.first_run", false);
          var bname = "perspectives-status-button";

          if (!document.getElementById(bname)) {
            // user has just installed the extension and has no button. add one
            Pers_add_toolbar_button.addToolbarButton("nav-bar", bname, "urlbar-container");
          }
          // else the user has already added the button previously
          // we don't want to touch it
      }

      if(!Perspectives.root_prefs.getBoolPref("extensions.perspectives.show_label")){
        document.getElementById("perspective-statusbar-label").hidden = true;
      }
    },

    // Preference migration from old names to new ones.
    // ensures prefereces match the 'extension.perspectives' naming convention
    // required by addons.mozilla.org
    // https://developer.mozilla.org/en-US/Add-ons/AMO/Policy/Reviews#Full_Review
    migrateOldSettings: function() {
      var preflist_numeric = ["perspectives.quorum_thresh","perspectives.required_duration","perspectives.security_settings","perspectives.max_timespan_for_inconsistency_test","perspectives.weak_consistency_time_limit","perspectives.max_cache_age_sec"];
      var preflist_string = ["perspectives.svg","perspectives.whitelist","perspectives.additional_notary_list","perspectives.default_notary_list"];
      var preflist_bool = ["perspectives.exceptions.permanent","perspectives.exceptions.enabled","perspectives.check_good_certificates","perspectives.require_user_permission","perspectives.show_label","perspectives.trust_https_with_weak_consistency","perspectives.prompt_update_all_https_setting","perspectives.enable_default_list_auto_update","perspectives.use_default_notary_list"];
      var root_prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
      var migration_needed  = root_prefs.getBoolPref("extensions.perspectives.preference_migration");

      var tmpNum = 0;
      var tmpStr = "";
      var tmpBool = true;

      if (migration_needed){
          for (index = 0; index < preflist_numeric.length; ++index) {
            if (root_prefs.getPrefType(preflist_numeric[index]) !== root_prefs.PREF_INVALID){
              tmpNum=root_prefs.getIntPref(preflist_numeric[index]);
              root_prefs.setIntPref("extensions." + preflist_numeric[index],tmpNum);
            }
          }
          for(index = 0; index < preflist_string.length; ++index) {
            if(root_prefs.getPrefType(preflist_string[index]) !== root_prefs.PREF_INVALID){
                tmpStr = root_prefs.getCharPref("" + preflist_string[index]);
                root_prefs.setCharPref("extensions." + preflist_string[index],tmpStr);
            }
          }
          for(index = 0; index < preflist_bool.length; ++index) {
            if(root_prefs.getPrefType(preflist_bool[index]) !== root_prefs.PREF_INVALID){
                tmpBool = root_prefs.getBoolPref("" + preflist_bool[index]);
                root_prefs.setBoolPref("extensions." + preflist_bool[index],tmpBool);
            }
          }
          root_prefs.setBoolPref("extensions.perspectives.preference_migration",false);
      }
    }

};
