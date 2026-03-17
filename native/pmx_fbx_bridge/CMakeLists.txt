cmake_minimum_required(VERSION 3.20)
project(pmx_fbx_bridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_CONFIGURATION_TYPES AND NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

add_executable(pmx_fbx_bridge
  src/main.cpp
  ../Pmx2Fbx-master/PmxLib/Utils.cpp
)

target_include_directories(pmx_fbx_bridge PRIVATE
  ../Pmx2Fbx-master/PmxLib
)

target_compile_definitions(pmx_fbx_bridge PRIVATE
  NOMINMAX
  _CRT_SECURE_NO_WARNINGS
  _MAX_INT_DIG=11
)

if(FBXSDK_ROOT)
  message(STATUS "Using FBXSDK_ROOT: ${FBXSDK_ROOT}")
  target_compile_definitions(pmx_fbx_bridge PRIVATE HAS_FBXSDK=1)

  target_include_directories(pmx_fbx_bridge PRIVATE
    "${FBXSDK_ROOT}/include"
  )

  if(MSVC)
    target_link_directories(pmx_fbx_bridge PRIVATE
      "${FBXSDK_ROOT}/lib/x64/release"
      "${FBXSDK_ROOT}/lib/x64/debug"
    )
    target_link_libraries(pmx_fbx_bridge PRIVATE
      libfbxsdk-md
      libxml2-md
      zlib-md
    )
  endif()
endif()
