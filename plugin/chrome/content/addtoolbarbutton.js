/*

The MIT License (MIT)

Copyright (c) 2007 Shimono

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/

// NOTE: This file and function *only* are used under a different license
// from the rest of Perspectives.
// code inspired by MDN toolbar examples
// https://developer.mozilla.org/ja/docs/Code_snippets/Toolbar
// https://developer.mozilla.org/en-US/Add-ons/Code_snippets/Toolbar
// https://developer.mozilla.org/en-US/docs/MDN/About#Copyrights_and_licenses

var Pers_add_toolbar_button = {

    addToolbarButton: function(toolbarId, buttonId, beforeId) {
      try {
        var firefoxnav = document.getElementById(toolbarId);
        var curSet = firefoxnav.currentSet;
        var re = new RegExp(beforeId);
        if (curSet.indexOf(buttonId) == -1) {
          var set;
          // Place the button before the element
          if (curSet.indexOf(beforeId) != -1) {
              set = curSet.replace(re, buttonId + "," + beforeId);
          } else { // at the end
              set = curSet + "," + buttonId;
          }
          firefoxnav.setAttribute("currentset", set);
          firefoxnav.currentSet = set;
          document.persist(toolbarId, "currentset");
          // If you don't do the following call, funny things happen
          try {
            BrowserToolboxCustomizeDone(true);
          }
          catch (e) { }
        }
      }
      catch(e) { }
      }

};
