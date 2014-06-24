# Perspectives
**Connect securely to https websites by checking certificates with network notaries.**

This directory includes the code for the Perspectives Firefox and Seamonkey clients.
For more information see: http://www.perspectives-project.org

## DEVELOPMENT

Requirements:
* a POSIX command line environment
* make
* zip

Optional (but strongly recommended!):
* python and the python 'lxml' library (to run the build tests)


To build, just type "make" (assuming of course you have make installed!). This will create a file called 'Perspectives.xpi'.

You can run Perspectives in Firefox using *Menu -> Add-ons -> Extensions -> (Tools icon) -> Install Add-On From File* and open to the ```Perspectives.xpi``` file.

To debug the extension:

* Download the latest [Firefox Aurora build 31](https://www.mozilla.org/firefox/channel/#aurora).
  * The latest version usually comes with better integration of debugging tools.
  * **Build 32 is not supported** right now (see [issue #123](https://github.com/danwent/Perspectives/issues/123)).
* Start your new browser with ```firefox31/firefox -P dev -no-remote -purgecaches &```
  * You should see the profile manager on the first start which creates a new profile called "dev".
  * For further information see [MDN - Setting up extension development environment](https://developer.mozilla.org/en/Setting_up_extension_development_environment).
* In ```~/.mozilla/firefox/r4nd0m5tr.dev/extensions``` create a file called ```perspectives@cmu.edu``` and enter the text ```Path_to_your_Perspectives_clone/plugin/``` (where you cloned the git repo to).
  * This enables you to see changes without having to rebuild with ```make``` everytime.
  * Unfortunately you still have to restart the browser because Perspectives is not yet a "restartless extensions" (see [issue #76](https://github.com/danwent/Perspectives/issues/76)).
* Enter ```about:config``` in the location bar and set the following variables:
  * ```devtools.debugger.remote-enabled = true```
  * ```devtools.chrome.enabled = true```
  * This enables you to use the "Browser Toolbox" (debugger).
  * For further information again see [MDN - Setting up extension development environment](https://developer.mozilla.org/en/Setting_up_extension_development_environment).
* Restart the browser and open *Menu -> Developer -> Browser Toolbox -> Ok -> Debugger*
  * Search for the file you want to debug (e.g. ```notaries.js```).
  * Search for the code line you want to debug and set a breakpoint.
* Edit the ```d_print_flags``` in ```plugin/chrome/content/common.js``` if you like to see some useful logs.
* Optional tips if you want speed-up development a bit:
  * If you just need console logs use *Menu -> Developer -> Browser Console* (```Ctrl + Shift + J```) instead of the "Browser Toolbox". The plain console loads a little faster (Note: "Browser Console" is not the standard "Javascript Console").
  * Use the ```debugger``` keyword in Javascript to make the debugger automatically jump to the file and codeline. You need to have "Browser Toolbox" already open though!
  * You can also move the *Developer menu* into the toolbar to skip one menu step.

## TESTING

To test Perspectives:

* Use 'make test' to build and install the Perspectives extension, as above
* Open chrome://perspectives/content/test/test.html in your browser
* Press the 'Run Tests' button

Test results will be displayed on the page.


Some tests are performed at build time - e.g. checking the localization files for the correct format and contents. All tests of the javascript code are run inside the extension - for security reasons they must be installed along with other extension files.

If you have ideas for further tests please let us know!

## CONTACT

You can contact the developers on the Perspectives Dev newsgroup:

https://groups.google.com/group/perspectives-dev
mailto:perspectives-dev@googlegroups.com

