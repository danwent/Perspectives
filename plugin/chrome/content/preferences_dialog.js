var Pers_pref = {
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefBranch),

	disable_quorum_text: function(is_disabled) { 
		document.getElementById("quorum-thresh-text").disabled=is_disabled;
		document.getElementById("quorum-duration-text").disabled=is_disabled; 
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
  
	load_preferences: function(){
		Pers_pref.security_class_change();  
	}
}

