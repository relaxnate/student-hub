; Student Hub NSIS custom installer script
; This file is optional — electron-builder includes it automatically if present.

!macro customHeader
  !system "echo Installing Student Hub"
!macroend

!macro customInstall
  ; Register the student-hub:// protocol handler
  WriteRegStr HKCU "Software\Classes\student-hub" "" "Student Hub Protocol"
  WriteRegStr HKCU "Software\Classes\student-hub" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\student-hub\DefaultIcon" "" "$INSTDIR\StudentHub.exe,1"
  WriteRegStr HKCU "Software\Classes\student-hub\shell\open\command" "" '"$INSTDIR\StudentHub.exe" "%1"'
!macroend

!macro customUnInstall
  ; Remove protocol handler on uninstall
  DeleteRegKey HKCU "Software\Classes\student-hub"
!macroend
