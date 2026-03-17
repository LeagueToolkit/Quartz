cmake_minimum_required(VERSION 3.20)
project(xps_fbx_bridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Ninja is single-config: force Release unless user sets one.
if(NOT CMAKE_CONFIGURATION_TYPES AND NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

add_executable(xps_fbx_bridge
  src/main.cpp
)

target_compile_definitions(xps_fbx_bridge PRIVATE
  $<$<CONFIG:Debug>:XPS_FBX_BRIDGE_DEBUG=1>
)

# Optional FBX SDK integration
# Set FBXSDK_ROOT to your Autodesk FBX SDK install path.
#
# Example:
#   cmake -S native/xps_fbx_bridge -B native/xps_fbx_bridge/build ^
#     -DFBXSDK_ROOT="C:/Program Files/Autodesk/FBX/FBX SDK/2020.3.7"
#
if(FBXSDK_ROOT)
  message(STATUS "Using FBXSDK_ROOT: ${FBXSDK_ROOT}")
  target_compile_definitions(xps_fbx_bridge PRIVATE HAS_FBXSDK=1)

  target_include_directories(xps_fbx_bridge PRIVATE
    "${FBXSDK_ROOT}/include"
  )

  if(MSVC)
    # Autodesk FBX SDK 2020.3.x layout:
    #   <FBXSDK_ROOT>/lib/x64/{release|debug}
    target_link_directories(xps_fbx_bridge PRIVATE
      "${FBXSDK_ROOT}/lib/x64/release"
      "${FBXSDK_ROOT}/lib/x64/debug"
    )
    target_link_libraries(xps_fbx_bridge PRIVATE
      libfbxsdk-md
      libxml2-md
      zlib-md
    )
  endif()
endif()
