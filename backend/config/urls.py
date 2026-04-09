from django.contrib import admin
from django.urls import include, path
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from django.urls import path
from django.views.decorators.cache import cache_page

schema_view = get_schema_view(
    openapi.Info(
        title="My API",
        default_version='v1',
        description="Документация API",
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)



urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("mafia.urls")),
    # Swagger UI
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),

    # ReDoc (альтернативный вид)
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]
