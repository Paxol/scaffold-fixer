using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ##namespace##.Entities;

namespace ##namespace##.Configurations;

public class ##type##Configuration : IEntityTypeConfiguration<##type##>
{
    public void Configure(EntityTypeBuilder<##type##> builder)
    {
##config##
    }
}
