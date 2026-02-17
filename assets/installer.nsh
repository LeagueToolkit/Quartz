!macro customInstall
  ; Register submenu for .bin files
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz" "MUIVerb" "Quartz"
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz" "Icon" "$appExe,0"
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz" "SubCommands" ""
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz" "Position" "mid"

  ; NoSkinLite
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\01noskinlite" "MUIVerb" "NoSkinLite"
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\01noskinlite" "Icon" "$appExe,0"
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\01noskinlite\command" "" '"$appExe" "%1" --noskinlite'

  ; Separate VFX
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\02separatevfx" "MUIVerb" "Separate VFX"
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\02separatevfx" "Icon" "$appExe,0"
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\02separatevfx\command" "" '"$appExe" "%1" --separate-vfx'

  ; Combine Linked
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\03combinelinked" "MUIVerb" "Combine Linked"
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\03combinelinked" "Icon" "$appExe,0"
  WriteRegStr HKCR "SystemFileAssociations\.bin\shell\Quartz\shell\03combinelinked\command" "" '"$appExe" "%1" --combine-linked'
!macroend

!macro customUnInstall
  DeleteRegKey HKCR "SystemFileAssociations\.bin\shell\Quartz"
!macroend
